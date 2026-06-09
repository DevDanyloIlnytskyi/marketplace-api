const { DataTypes } = require('sequelize');



/**

 * Define all Sequelize models on a tenant-specific connection.

 * Cached per database name in connection.js.

 *

 * Source of truth: test_bd schema (Platform PG-0 audit). Runtime uses these definitions only.

 * @param {import('sequelize').Sequelize} sequelize

 */

function defineTenantModels(sequelize) {

  const BaseInfo = sequelize.define(

    'base_info',

    {

      id: { type: DataTypes.CHAR(36), primaryKey: true, allowNull: false },

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

    { freezeTableName: true, timestamps: false },

  );



  const Category = sequelize.define(

    'categories',

    {

      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      id_bas: { type: DataTypes.STRING(255), unique: true, allowNull: false },

      name: { type: DataTypes.STRING(255), allowNull: true },

      categories_id: { type: DataTypes.INTEGER, allowNull: true },

    },

    { freezeTableName: true, timestamps: false },

  );



  const Product = sequelize.define(

    'products',

    {

      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      id_bas: { type: DataTypes.STRING(255), unique: true, allowNull: false },

      name: { type: DataTypes.STRING(255), allowNull: false },

      description: { type: DataTypes.TEXT, allowNull: true },

      main_photo: { type: DataTypes.STRING(255), allowNull: true },

      categories_id: { type: DataTypes.INTEGER, allowNull: true },

      actual: { type: DataTypes.BOOLEAN, allowNull: true },

      manufacturer: { type: DataTypes.CHAR(255), allowNull: true },

    },

    { freezeTableName: true, timestamps: false },

  );



  const Orders = sequelize.define(

    'orders',

    {

      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      client_first_name: { type: DataTypes.STRING(255), allowNull: false },

      client_second_name: { type: DataTypes.STRING(255), allowNull: false },

      phone: { type: DataTypes.STRING(255), allowNull: false },

      email: { type: DataTypes.STRING(255), allowNull: true },

      total_price: { type: DataTypes.STRING(255), allowNull: true },

      active: { type: DataTypes.BOOLEAN, allowNull: false },

      date_created: {

        type: DataTypes.DATE,

        allowNull: false,

        defaultValue: DataTypes.NOW,

      },

      products: { type: DataTypes.JSON, allowNull: true },

    },

    { freezeTableName: true, timestamps: false },

  );



  const User = sequelize.define(

    'users',

    {

      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      login: { type: DataTypes.STRING(255), unique: true, allowNull: false },

      password: { type: DataTypes.STRING(255), allowNull: false },

      secret_key: { type: DataTypes.STRING(255), allowNull: false },

    },

    { freezeTableName: true, timestamps: false },

  );



  const Products_price = sequelize.define(

    'products_price',

    {

      id_bas_product: { type: DataTypes.STRING(255), primaryKey: true, allowNull: false },

      price: { type: DataTypes.INTEGER, allowNull: false },

      action_price: { type: DataTypes.INTEGER, allowNull: true },

    },

    { freezeTableName: true, timestamps: false },

  );



  const Products_quantity = sequelize.define(

    'products_quantity',

    {

      id_bas_product: { type: DataTypes.STRING(255), primaryKey: true, allowNull: false },

      quantity: { type: DataTypes.INTEGER, allowNull: false },

    },

    { freezeTableName: true, timestamps: false },

  );



  const Products_photo = sequelize.define(

    'products_photos',

    {

      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      id_bas_product: { type: DataTypes.STRING(255), allowNull: false },

      photo: { type: DataTypes.STRING(255), allowNull: true },

    },

    { freezeTableName: true, timestamps: false },

  );



  const Propertie = sequelize.define(

    'properties',

    {

      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      id_bas: { type: DataTypes.STRING(255), unique: true, allowNull: false },

      name: { type: DataTypes.STRING(255), allowNull: false },

      id_bas_category: { type: DataTypes.STRING(255), allowNull: true },

    },

    { freezeTableName: true, timestamps: false },

  );



  const Products_propertie = sequelize.define(

    'products_properties',

    {

      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      id_bas_product: { type: DataTypes.STRING(255), allowNull: false },

      id_bas_property: { type: DataTypes.STRING(255), allowNull: false },

      value: { type: DataTypes.STRING(255), allowNull: true },

    },

    { freezeTableName: true, timestamps: false },

  );



  return {

    BaseInfo,

    Category,

    Product,

    Orders,

    User,

    Products_price,

    Products_quantity,

    Products_photo,

    Propertie,

    Products_propertie,

  };

}



module.exports = { defineTenantModels };


