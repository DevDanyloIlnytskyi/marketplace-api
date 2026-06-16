/**
 * Platform-6.1 — sync job infrastructure smoke test.
 *
 * Usage (after migration on test_bd):
 *   npm run integration-sync-jobs:smoke
 */
require('dotenv').config();

const { Op } = require('sequelize');

const http = require('http');
const app = require('../app');
const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const {
  startNoOpWorker,
  stopNoOpWorker,
  acquireLease,
  renewHeartbeat,
  getJob,
  updateJob,
  SYNC_LEASE_DURATION_MS,
  ACTIVE_SYNC_JOB_STATUSES,
} = require('../shared/integration-sync');

const TENANT_DOMAIN = process.env.SMOKE_TENANT_DOMAIN || 'demo.local';
const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const RUN_ID = Date.now();

/** @type {Record<string, { status: 'PASS' | 'FAIL', detail?: string }>} */
const results = {};

function record(name, status, detail = '') {
  results[name] = { status, detail };
  const icon = status === 'PASS' ? '✓' : '✗';
  console.log(`${icon} ${name}${detail ? `: ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {number} port
 * @param {string} urlPath
 * @param {'GET'|'POST'} method
 * @param {{ apiKey: string, idempotencyKey?: string, body?: object }} options
 */
function httpRequest(port, urlPath, method, options) {
  const payload = options.body !== undefined ? JSON.stringify(options.body) : '';
  return new Promise((resolve, reject) => {
    /** @type {Record<string, string>} */
    const headers = {
      Host: TENANT_DOMAIN,
      'Content-Type': 'application/json',
      'X-API-Key': options.apiKey,
    };
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
          });
        });
      },
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

const CREATE_BODY = {
  jobType: 'full_catalog',
  syncMode: 'full',
  clientReference: `p61-smoke-${RUN_ID}`,
  expectedCounts: { products: 0, prices: 0, stock: 0, media: 0 },
  sourceType: 'inline',
};

async function waitForJobStatus(models, jobId, targetStatus, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await getJob(models, jobId);
    if (job?.status === targetStatus) {
      return job;
    }
    await sleep(200);
  }
  throw new Error(`Timeout waiting for job ${jobId} status ${targetStatus}`);
}

async function main() {
  console.log('\n=== Platform-6.1 Sync Job Infrastructure Smoke ===\n');

  const tenant = findTenantById(TENANT_ID);
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}`);
  }

  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);
  await sequelize.authenticate();

  await models.IntegrationSyncJob.update(
    {
      status: 'cancelled',
      finished_at: new Date(),
      worker_id: null,
      heartbeat_at: null,
      lease_expires_at: null,
      updated_at: new Date(),
    },
    {
      where: {
        tenant_id: tenant.id,
        status: { [Op.in]: ACTIVE_SYNC_JOB_STATUSES },
      },
    },
  );

  const { plaintext: apiKey, record: keyRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-6.1 sync smoke',
    scopes: ['sync.read', 'sync.write'],
    createdBy: 'integration-sync-jobs-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;

  try {
    const createKeyHeader = `p61-create-${RUN_ID}`;
    const create = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: createKeyHeader,
      body: CREATE_BODY,
    });
    assert(create.status === 201, `create expected 201 got ${create.status}`);
    assert(create.body?.data?.jobId, 'create missing jobId');
    assert(create.body?.data?.status === 'pending', 'create status pending');
    const jobId = create.body.data.jobId;
    record('create_job', 'PASS');

    const replay = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: createKeyHeader,
      body: CREATE_BODY,
    });
    assert(replay.status === 201, `replay expected 201 got ${replay.status}`);
    assert(replay.headers['x-idempotent-replay'] === 'true', 'replay header');
    assert(replay.body?.data?.jobId === jobId, 'replay same jobId');
    record('idempotency', 'PASS');

    const conflict = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: createKeyHeader,
      body: { ...CREATE_BODY, clientReference: 'different-ref' },
    });
    assert(conflict.status === 409, `conflict expected 409 got ${conflict.status}`);
    assert(conflict.body?.code === 'IDEMPOTENCY_CONFLICT', 'conflict code');
    record('idempotency', 'PASS', 'replay + conflict');

    const mutexKey = `p61-mutex-${RUN_ID}`;
    const mutexCreate = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: mutexKey,
      body: { ...CREATE_BODY, clientReference: `p61-mutex-${RUN_ID}` },
    });
    assert(mutexCreate.status === 409, `mutex expected 409 got ${mutexCreate.status}`);
    assert(mutexCreate.body?.code === 'SYNC_ALREADY_RUNNING', 'mutex code');
    record('tenant_mutex', 'PASS');

    startNoOpWorker({ intervalMs: 500 });
    const completedJob = await waitForJobStatus(models, jobId, 'completed');
    assert(completedJob.status === 'completed', 'worker completed job');
    record('worker_lifecycle', 'PASS');

    const getJobRes = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}`,
      'GET',
      { apiKey },
    );
    assert(getJobRes.status === 200, 'get job 200');
    assert(getJobRes.body?.data?.status === 'completed', 'get job completed');
    assert(getJobRes.body?.data?.phaseUploadProgress !== undefined, 'phase upload tracking');
    record('get_job', 'PASS');

    const eventsRes = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/events`,
      'GET',
      { apiKey },
    );
    assert(eventsRes.status === 200, 'events 200');
    const eventTypes = eventsRes.body?.data?.events?.map((e) => e.eventType) || [];
    assert(eventTypes.includes('job.created'), 'event created');
    assert(eventTypes.includes('job.started'), 'event started');
    assert(eventTypes.includes('job.completed'), 'event completed');
    record('events', 'PASS');

    stopNoOpWorker();

    const leaseJobKey = `p61-lease-${RUN_ID}`;
    const leaseCreate = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: leaseJobKey,
      body: { ...CREATE_BODY, clientReference: `p61-lease-${RUN_ID}` },
    });
    assert(leaseCreate.status === 201, 'lease job create');
    const leaseJobId = leaseCreate.body.data.jobId;

    const workerA = 'worker-a-smoke';
    const workerB = 'worker-b-smoke';
    const acquiredA = await acquireLease(models, leaseJobId, workerA);
    assert(acquiredA, 'worker A acquire lease');
    const acquiredB = await acquireLease(models, leaseJobId, workerB);
    assert(!acquiredB, 'worker B blocked while lease active');
    record('lease_acquire', 'PASS');

    await updateJob(models, leaseJobId, {
      lease_expires_at: new Date(Date.now() - 1000),
    });
    const acquiredBAfterExpiry = await acquireLease(models, leaseJobId, workerB);
    assert(acquiredBAfterExpiry, 'worker B acquire after expiry');
    record('lease_expiry', 'PASS');

    await renewHeartbeat(models, leaseJobId, workerB);
    const afterRenew = await getJob(models, leaseJobId);
    assert(afterRenew.lease_expires_at > new Date(), 'lease renewed');
    await updateJob(models, leaseJobId, {
      status: 'cancelled',
      finished_at: new Date(),
      worker_id: null,
      lease_expires_at: null,
    });

    const resumeJobKey = `p61-resume-${RUN_ID}`;
    const resumeCreate = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: resumeJobKey,
      body: { ...CREATE_BODY, clientReference: `p61-resume-${RUN_ID}` },
    });
    assert(resumeCreate.status === 201, 'resume job create');
    const resumeJobId = resumeCreate.body.data.jobId;
    stopNoOpWorker();
    await updateJob(models, resumeJobId, { status: 'paused' });

    const resumeRes = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${resumeJobId}/resume`,
      'POST',
      { apiKey, body: {} },
    );
    assert(resumeRes.status === 202, `resume expected 202 got ${resumeRes.status}`);
    assert(resumeRes.body?.data?.status === 'running', 'resume status running');
    record('resume', 'PASS');
    await updateJob(models, resumeJobId, {
      status: 'cancelled',
      finished_at: new Date(),
    });

    const cancelJobKey = `p61-cancel-${RUN_ID}`;
    const cancelCreate = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: cancelJobKey,
      body: { ...CREATE_BODY, clientReference: `p61-cancel-${RUN_ID}` },
    });
    assert(cancelCreate.status === 201, 'cancel job create');
    const cancelJobId = cancelCreate.body.data.jobId;
    await updateJob(models, cancelJobId, {
      status: 'running',
      started_at: new Date(),
      worker_id: 'manual-smoke',
      heartbeat_at: new Date(),
      lease_expires_at: new Date(Date.now() + SYNC_LEASE_DURATION_MS),
    });

    const cancelRes = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${cancelJobId}/cancel`,
      'POST',
      { apiKey, body: {} },
    );
    assert(cancelRes.status === 202, `cancel expected 202 got ${cancelRes.status}`);
    assert(cancelRes.body?.data?.status === 'cancelled', 'cancel status');
    record('cancel', 'PASS');

    console.log('\n=== ALL PLATFORM-6.1 CHECKS PASSED ===\n');
    console.log('READY_FOR_PLATFORM_6_2');
  } finally {
    stopNoOpWorker();
    await revokeKey(models, keyRecord.id, 'platform-61-smoke cleanup');
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error('\nSMOKE FAILED:', error.message);
  console.error('\nBLOCKERS');
  process.exit(1);
});
