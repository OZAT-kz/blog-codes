// ==============================================================================
// Cloud Spanner E-Commerce Schema (Interleaved)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/spanner_ecommerce_schema_kz.sql
// ==============================================================================

-- DDL Схема Cloud Spanner для e-commerce с защитой от Hotspotting (Interleaved таблицы)
CREATE TABLE Customers (
  CustomerId STRING(36) NOT NULL,
  FullName STRING(255) NOT NULL,
  PhoneNumber STRING(32) NOT NULL,
  CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (CustomerId);

CREATE TABLE Orders (
  CustomerId STRING(36) NOT NULL,
  OrderId STRING(36) NOT NULL,
  OrderStatus STRING(32) NOT NULL,
  TotalAmount NUMERIC NOT NULL,
  OrderTimestamp TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (CustomerId, OrderId),
  INTERLEAVE IN PARENT Customers ON DELETE CASCADE;

CREATE TABLE OrderItems (
  CustomerId STRING(36) NOT NULL,
  OrderId STRING(36) NOT NULL,
  ItemId STRING(36) NOT NULL,
  SkuId STRING(64) NOT NULL,
  Quantity INT64 NOT NULL,
  UnitPrice NUMERIC NOT NULL,
) PRIMARY KEY (CustomerId, OrderId, ItemId),
  INTERLEAVE IN PARENT Orders ON DELETE CASCADE;

CREATE INDEX OrdersByStatusTimestamp ON Orders(OrderStatus, OrderTimestamp DESC);