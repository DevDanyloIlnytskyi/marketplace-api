const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const products_quantitySchema = sequelize.define(
    'products_quantity',
    {
        id_bas_product: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
        },
        quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = products_quantitySchema;
