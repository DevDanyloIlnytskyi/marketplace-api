const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

/**
 * Order line items are stored in `products` (JSON), not a separate order_items table.
 * Sequelize.JSON maps to MySQL JSON (5.7+) or equivalent; driver serializes arrays/objects.
 */
const ordersSchema = sequelize.define(
    'orders',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        client_first_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        client_second_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        phone: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        total_price: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
        },
        date_created: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        products: {
            type: DataTypes.JSON,
            allowNull: true,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = ordersSchema;
