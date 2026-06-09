const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

/** Legacy mirror of model-registry.js — not used at runtime. Kept aligned for PG-0. */
const propertiesSchema = sequelize.define(
    'properties',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        id_bas: {
            type: DataTypes.STRING(255),
            unique: true,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        id_bas_category: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = propertiesSchema;
