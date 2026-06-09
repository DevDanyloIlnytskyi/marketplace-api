const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

/** Legacy mirror of model-registry.js — not used at runtime. Kept aligned for PG-0. */
const baseInfoSchema = sequelize.define(
    'base_info',
    {
        id: {
            type: DataTypes.CHAR(36),
            primaryKey: true,
            allowNull: false,
        },
        name: { type: DataTypes.STRING(255), allowNull: true },
        phone: { type: DataTypes.STRING(255), allowNull: true },
        adress: { type: DataTypes.STRING(255), allowNull: true },
        email: { type: DataTypes.STRING(255), allowNull: true },
        about: { type: DataTypes.STRING(255), allowNull: true },
        contact: { type: DataTypes.STRING(255), allowNull: true },
        facebook: { type: DataTypes.STRING(255), allowNull: true },
        instagram: { type: DataTypes.STRING(255), allowNull: true },
        telegram: { type: DataTypes.STRING(255), allowNull: true },
        tiktok: { type: DataTypes.STRING(255), allowNull: true },
        youtube: { type: DataTypes.STRING(255), allowNull: true },
        logo: { type: DataTypes.STRING(255), allowNull: true },
        x: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = baseInfoSchema;
