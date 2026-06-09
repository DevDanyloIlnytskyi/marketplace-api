const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const products_photoSchema = sequelize.define(
    'products_photos',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        id_bas_product: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        photo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = products_photoSchema;
