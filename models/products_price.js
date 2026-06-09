const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const products_priceSchema = sequelize.define(
    'products_price',
    {
        id_bas_product: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
        },
        price: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        action_price: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = products_priceSchema;
