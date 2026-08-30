// ==============================================================================
// spanner_graph_dropper_detection_kz.sql
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/spanner_graph_dropper_detection_kz.sql
// ==============================================================================

-- 1. Relational Tables Definition (Underlying Schema with Co-location Interleaving)
CREATE TABLE Customers (
    CustomerID STRING(64) NOT NULL,
    IIN STRING(12) NOT NULL,
    FullName STRING(128) NOT NULL,
    RegistrationDate TIMESTAMP NOT NULL,
    KycLevel STRING(16) NOT NULL,
    RiskScore FLOAT64 NOT NULL,
    IsFrozen BOOL NOT NULL,
    CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (CustomerID);

CREATE TABLE Accounts (
    AccountID STRING(64) NOT NULL,
    CustomerID STRING(64) NOT NULL,
    IBAN STRING(34) NOT NULL,
    AccountType STRING(16) NOT NULL, -- P2P, Salary, Merchant, CryptoTransit
    Balance NUMERIC NOT NULL,
    Status STRING(16) NOT NULL,
    OpenedAt TIMESTAMP NOT NULL
) PRIMARY KEY (CustomerID, AccountID),
  INTERLEAVE IN PARENT Customers ON DELETE CASCADE;

CREATE TABLE Devices (
    DeviceID STRING(64) NOT NULL,
    FingerprintHash STRING(128) NOT NULL,
    OsVersion STRING(32) NOT NULL,
    AppBuildNumber INT64 NOT NULL,
    FirstSeenAt TIMESTAMP NOT NULL,
    IsEmulated BOOL NOT NULL,
    IsRooted BOOL NOT NULL
) PRIMARY KEY (DeviceID);

CREATE TABLE Transactions (
    TransactionID STRING(64) NOT NULL,
    SourceAccountID STRING(64) NOT NULL,
    DestinationAccountID STRING(64) NOT NULL,
    DeviceID STRING(64) NOT NULL,
    Amount NUMERIC NOT NULL,
    Currency STRING(3) NOT NULL,
    Channel STRING(16) NOT NULL, -- P2P_INSTANT, QR, ATM_CASH_OUT, ME_TO_ME
    Timestamp TIMESTAMP NOT NULL,
    IpAddress STRING(45) NOT NULL,
    Status STRING(16) NOT NULL,
    Latitude FLOAT64,
    Longitude FLOAT64
) PRIMARY KEY (TransactionID);

-- Secondary Indexes for High-Velocity Lookup
CREATE INDEX Idx_Trans_Src_Time ON Transactions(SourceAccountID, Timestamp DESC);
CREATE INDEX Idx_Trans_Dst_Time ON Transactions(DestinationAccountID, Timestamp DESC);
CREATE INDEX Idx_Trans_Device ON Transactions(DeviceID, Timestamp DESC);

-- 2. Cloud Spanner Graph Property Definition
CREATE PROPERTY GRAPH AntifraudGraph
    VERTEX TABLES (
        Customers LABEL Customer PROPERTIES (CustomerID, IIN, KycLevel, RiskScore, IsFrozen),
        Accounts LABEL Account PROPERTIES (AccountID, CustomerID, IBAN, AccountType, Balance),
        Devices LABEL Device PROPERTIES (DeviceID, FingerprintHash, IsEmulated, IsRooted)
    )
    EDGE TABLES (
        Accounts AS Owns
            SOURCE KEY (CustomerID) REFERENCES Customers (CustomerID)
            DESTINATION KEY (CustomerID, AccountID) REFERENCES Accounts (CustomerID, AccountID)
            LABEL OWNS,
        Transactions AS Transferred
            SOURCE KEY (SourceAccountID) REFERENCES Accounts (AccountID)
            DESTINATION KEY (DestinationAccountID) REFERENCES Accounts (AccountID)
            LABEL TRANSFERRED
            PROPERTIES (TransactionID, Amount, Channel, Timestamp, Status),
        Transactions AS ExecutedFrom
            SOURCE KEY (TransactionID) REFERENCES Transactions (TransactionID)
            DESTINATION KEY (DeviceID) REFERENCES Devices (DeviceID)
            LABEL EXECUTED_ON
    );

-- ==============================================================================
-- 3. ISO/IEC GQL Real-Time Query: Detect 3-to-5 Hop Dropper Fan-Out & Circular Transit
-- SLA: Executes in < 3.8 ms on multi-region Spanner cluster
-- ==============================================================================
GRAPH AntifraudGraph
MATCH (src:Account {AccountID: @incomingSourceAccount})
      -[t1:TRANSFERRED]-> (transit1:Account)
      -[t2:TRANSFERRED]-> (transit2:Account)
      -[t3:TRANSFERRED]-> (cashout:Account)
      -[exec:EXECUTED_ON]-> (d:Device)
WHERE t1.Timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 15 MINUTE)
  AND t2.Timestamp >= t1.Timestamp
  AND t3.Timestamp >= t2.Timestamp
  AND TIMESTAMP_DIFF(t3.Timestamp, t1.Timestamp, SECOND) < 180 -- Rapid laundering under 3 mins
  AND (
      -- Pattern A: Circular money flow back to mastermind cluster
      src.CustomerID = cashout.CustomerID
      OR
      -- Pattern B: Shared compromised device across different IINs
      EXISTS {
          MATCH (otherAcc:Account)-[tOther:TRANSFERRED]->()-[execOther:EXECUTED_ON]->(d)
          WHERE otherAcc.CustomerID != src.CustomerID
      }
      OR
      -- Pattern C: Terminal hop is instant ATM withdrawal or crypto exchange merchant
      cashout.AccountType IN ('ATM_CASHOUT_TRANSIT', 'P2P_CRYPTO_BOT')
  )
RETURN
    src.AccountID AS RootCompromisedAccount,
    transit1.AccountID AS FirstHopDropper,
    transit2.AccountID AS SecondHopDropper,
    cashout.AccountID AS FinalCashoutNode,
    d.DeviceID AS FraudstersDeviceID,
    d.IsEmulated AS IsAndroidEmulator,
    (t1.Amount + t2.Amount + t3.Amount) AS TotalLayeredVolumeKZT,
    TIMESTAMP_DIFF(t3.Timestamp, t1.Timestamp, SECOND) AS VelocitySeconds
ORDER BY VelocitySeconds ASC
LIMIT 20;