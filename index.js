require('dotenv').config();

const { validateEnv } = require('./shared/config/validate-env');

validateEnv();

const app = require('./app');
const port = process.env.port || 5000;

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});