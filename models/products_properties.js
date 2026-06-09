const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

/** Legacy mirror of model-registry.js — not used at runtime. Kept aligned for PG-0. */
const products_propertieSchema = sequelize.define(
    'products_properties',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        id_bas_product: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        id_bas_property: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        value: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = products_propertieSchema;
