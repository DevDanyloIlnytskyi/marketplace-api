const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const productSchema = sequelize.define(
    'products',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        id_bas: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        main_photo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        categories_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        actual: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
        },
        manufacturer: {
            type: DataTypes.CHAR(255),
            allowNull: true,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = productSchema;
