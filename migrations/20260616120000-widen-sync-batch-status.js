/**
 * Widen integration_sync_job_batches.status to fit completed_with_errors (21 chars).
 */
module.exports = {
  /**
   * @param {import('sequelize').QueryInterface} queryInterface
   * @param {import('sequelize').Sequelize} Sequelize
   */
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('integration_sync_job_batches', 'status', {
      type: Sequelize.STRING(32),
      allowNull: false,
      defaultValue: 'pending',
    });
  },

  /**
   * @param {import('sequelize').QueryInterface} queryInterface
   * @param {import('sequelize').Sequelize} Sequelize
   */
  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('integration_sync_job_batches', 'status', {
      type: Sequelize.STRING(16),
      allowNull: false,
      defaultValue: 'pending',
    });
  },
};
