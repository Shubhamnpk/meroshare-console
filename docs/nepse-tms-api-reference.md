# NEPSE TMS API Reference

Complete documentation of the NEPSE Trading Management System (TMS) API endpoints.

**Source**: `https://tms77.nepsetms.com.np` (main.js bundle - 7.7MB)  
**Generated**: 2026-09-08

---

## Table of Contents

1. [Authentication](#authentication)
2. [Captcha](#captcha)
3. [Order Management](#order-management)
4. [Trade & Settlement](#trade--settlement)
5. [Client Management](#client-management)
6. [Fund Management](#fund-management)
7. [Market Data](#market-data)
8. [Market Maker](#market-maker)
9. [RMS (Risk Management)](#rms-risk-management)
10. [Company & Securities](#company--securities)
11. [Metadata & Administration](#metadata--administration)
12. [User Management](#user-management)
13. [Dealer Management](#dealer-management)
14. [Member Management](#member-management)
15. [Application Workflow](#application-workflow)
16. [Collateral Management](#collateral-management)
17. [Net Settlement](#net-settlement)
18. [Fund Transfer](#fund-transfer)
19. [NCHL Integration](#nchl-integration)
20. [Notifications](#notifications)
21. [Audit & Reporting](#audit--reporting)
22. [Configuration & System](#configuration--system)
23. [File Operations](#file-operations)
24. [Grievance Management](#grievance-management)
25. [Summary Statistics](#summary-statistics)

---

## Authentication

### Base Path: `/authApi`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/authenticate` | Login with credentials |
| POST | `/authenticate/logout` | Logout |
| GET | `/authenticate/refresh` | Refresh JWT token |
| POST | `/authenticate/changePassword` | Change password |
| POST | `/authenticate/forgotPassword` | Forgot password |
| POST | `/authenticate/reset` | Reset password |
| POST | `/authenticate/reset/users` | Bulk reset users |
| POST | `/authenticate/default` | Default authentication |
| POST | `/authenticate/dob` | Date of birth verification |
| POST | `/authenticate/resendOtp` | Resend OTP |
| GET | `/authenticate/verifyMailToken?token=` | Verify email token |
| GET | `/session/invalidate/` | Invalidate session |

### Login Flow

```
1. GET  /captcha/id                           → Get captcha ID
2. GET  /captcha/image/{captchaId}            → Get captcha image
3. POST /authApi/authenticate                 → Login with credentials + captcha
4. Response: { token, refreshToken }
5. GET  /authApi/authenticate/refresh         → Refresh expired token
6. POST /authApi/authenticate/logout          → Logout
```

### Headers Required

| Header | Description |
|--------|-------------|
| `Authorization` | `Bearer {jwtToken}` |
| `X-XSRF-TOKEN` | Cross-site request forgery token |
| `Content-Type` | `application/json` |

---

## Captcha

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/captcha/id` | Get new captcha ID |
| GET | `/captcha/image/` | Get captcha image |
| GET | `/captcha/audio/` | Get audio captcha |
| GET | `/captcha/reload/` | Reload captcha |

---

## Order Management

### Base Path: `/orderApi`

#### Order Placement

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orderbook/` | Place order (standard) |
| POST | `/orderbook-v2/place-mis-orders` | Place MIS orders |
| POST | `/offlineorder/` | Place offline order |
| POST | `/offlineorder/place-all` | Place all offline orders |
| POST | `/offlineorder/cancel` | Cancel offline order |
| POST | `/offlineorder/cancel-all/` | Cancel all offline orders |

#### Order Cancellation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orderbook/cancel/` | Cancel order |
| POST | `/orderbook/cancel-v2/` | Cancel order v2 |
| POST | `/order/cancel/` | Cancel order |
| POST | `/order/cancel-all/` | Cancel all orders |

#### Order Book Queries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/orderbook` | Get order book |
| GET | `/orderbook/` | Get order book (alt) |
| GET | `/orderbook-v2/` | Get order book v2 |
| GET | `/orderbook-v2/V3/` | Get order book v3 |
| GET | `/orderbook/client/` | Get client orders |
| GET | `/orderbook/client/active-order/` | Get active orders |
| GET | `/orderbook/dealer/` | Get dealer orders |
| POST | `/orderbook/last-order/` | Get last order |

#### Order History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/orderbook-history/` | Get order history |
| GET | `/orderbook-history/client/` | Get client order history |
| GET | `/orderbook-history?` | Get order history (query) |

#### Order Types

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ordertypes` | Get order types |
| GET | `/ordertypes/client/` | Get client order types |
| GET | `/ordertypes/orderplacement` | Get order placement types |
| GET | `/ordervalidity` | Get order validity |
| GET | `/ordervalidity/orderplacement` | Get order validity for placement |

#### Offline Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/offlineorder/` | Get offline orders |
| GET | `/offlineorder-history/` | Get offline order history |
| GET | `/offlineorder-history/client/` | Get client offline order history |

---

## Trade & Settlement

### Base Path: `/orderTradeApi`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/trade-book` | Get trade book |
| GET | `/trade-book/${clientId}` | Get client trade book |
| GET | `/trade-book/sell/${clientId}` | Get sell trades |
| GET | `/trade-book/${clientId}/consolidated` | Get consolidated trades |
| GET | `/trade-book/${clientId}/consolidated/sell` | Get consolidated sell trades |
| GET | `/trade-book` | Get trade book (query params) |
| GET | `/trade-book/group?` | Get trade book by group |
| GET | `/trade-book/v2/contract/${clientId}` | Get contract v2 |
| GET | `/trade-book/v2/contract-bulk/${clientId}` | Get bulk contract |
| GET | `/trade-book/v3/contract/${clientId}` | Get contract v3 |
| GET | `/trade-book/v3/consolidated/${clientId}` | Get consolidated v3 |
| GET | `/trade-book/v4/group/${groupId}` | Get group trade book v4 |
| GET | `/trade-book/brokerage?` | Get brokerage info |
| GET | `/trade-settlement/get-contract-note/${contractNoteId}` | Get contract note |
| GET | `/trade-settlement/sell-contract-note/client/${clientId}` | Get sell contract note |

### Settlement

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/settlement-master` | Get settlement master |
| GET | `/trade-settlement/contract-${contractNoteId}/client/${clientId}` | Get settlement details |

---

## Client Management

### Base Path: `/clientApi`

#### Client CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clientDealer/` | Get client dealer |
| GET | `/clientDealer/info/` | Get client dealer info |
| GET | `/clientDealer/dashboard/` | Get client dashboard |
| GET | `/clientDealer/allclientdealers` | Get all client dealers |
| GET | `/clientDealer/dealers` | Get dealers |
| GET | `/clientDealer/products` | Get products |
| GET | `/clientDealer/clientDealerTypes` | Get client dealer types |
| GET | `/clientDealer/clientDealerTypesKycForm` | Get KYC form types |
| GET | `/clientDealer/proofDocuments` | Get proof documents |
| GET | `/clientDealer/sector` | Get sectors |
| GET | `/clientDealer/pro` | Get professional clients |
| GET | `/clientDealer/pro/check` | Check professional status |
| GET | `/clientDealer/proClient` | Get pro clients |

#### Client Validation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clientDealer/isCompanyRegistrationUnique?` | Check company registration |
| GET | `/clientDealer/isDepositoryDetailsValid?` | Validate depository details |
| GET | `/clientDealer/validateCitizenship?` | Validate citizenship |
| POST | `/clientDealer/isBoidValid` | Validate BOID |
| POST | `/clientDealer/isNidValid` | Validate NID |

#### Client Activation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/clientDealer/activateClient` | Activate client |
| POST | `/clientDealer/activateClient/deactivated` | Activate from deactivated |

#### Client Search & Paged

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/masterclients/` | Get master clients |
| GET | `/masterclients/clients` | Get clients |
| GET | `/masterclients/clients/` | Get clients (alt) |
| GET | `/masterclients/dealers` | Get dealers |
| GET | `/masterclients/clientDealerPaged?` | Get paged client dealers |
| GET | `/masterclients/clientPaged?` | Get paged clients |
| GET | `/masterclients/clientsSearch?` | Search clients |
| GET | `/masterclients/clientsSearchInfo?` | Search client info |
| POST | `/masterclients/clientPaged?` | Get paged clients (POST) |
| POST | `/masterclients/clientDealerPagedV2` | Get paged client dealers v2 |
| POST | `/masterclients/clientDealerPagedV2/` | Get paged client dealers v2 (alt) |

#### Client Mappings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/masterclients/client-activation/` | Get client activation |
| GET | `/masterclients/clientDealerApplication/` | Get client dealer application |
| GET | `/masterclients/getClient/` | Get client |
| POST | `/masterclients/fetchMappedClientList/` | Fetch mapped client list |
| POST | `/masterclients/cfsClients/` | Get CFS clients |

#### Client Incoming Updates

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/masterclients/incoming-update/approve` | Approve incoming update |
| POST | `/masterclients/incoming-update/reject` | Reject incoming update |
| POST | `/masterclients/isUccFieldChanged` | Check UCC field change |

#### Client Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients/activeClientGroups` | Get active client groups |
| GET | `/clients/clientGroupPool` | Get client group pool |
| GET | `/clients/clientGroups` | Get client groups |

#### Client Portfolio

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/client-portfolio/clientDealerData` | Get client dealer data |
| GET | `/client-portfolio/dealerData` | Get dealer data |
| GET | `/client-portfolio/depositoryHoldings/` | Get depository holdings |
| GET | `/client-portfolio/getData/` | Get portfolio data |

#### Client Depository Details

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/client-depository-details/allBOID` | Get all BOIDs |
| GET | `/dp-holding/` | Get DP holding |
| GET | `/dp-holding/dto` | Get DP holding DTO |
| GET | `/dp-holding/pending-orders/` | Get pending orders |

#### Client Bank Details

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clientDealerBankDetail/bank-detail/` | Get bank detail |

#### Client Net Update

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/client-net-update/client-dealer-master` | Get client dealer master |
| GET | `/client-net-update/client-dealer-types` | Get client dealer types |
| GET | `/client-net-update/get-dropdown-values` | Get dropdown values |
| GET | `/client-net-update/get-table-data/` | Get table data |
| GET | `/client-net-update/products` | Get products |
| POST | `/client-net-update/is-record-unique` | Check record uniqueness |
| POST | `/client-net-update/squaredOff-order-entry` | Squared off order entry |

---

## Fund Management

### Fund Transfer

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/fund-transfer-direction?code=` | Get fund transfer direction |
| GET | `/fund-transfer-type?code=` | Get fund transfer type |
| POST | `/manual-fund-transfer` | Manual fund transfer |

### Fund Deposit

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/external/fundDepositScreenData` | Get fund deposit screen data |
| GET | `/external/fundDepositScreenDataFromCache` | Get cached deposit data |
| GET | `/external/fundtransfertypes` | Get fund transfer types |
| POST | `/external/sendBankRequest` | Send bank request |
| POST | `/external/initiatetransaction` | Initiate transaction |
| POST | `/external/secondPhaseRequest/` | Second phase request |
| GET | `/external/secondPhaseResponse/` | Second phase response |
| POST | `/external/sendVerificationRequest` | Send verification request |
| POST | `/external/eWallet/sendVerificationRequest` | eWallet verification |
| POST | `/external/eWallet/sendMemberPaymentVerificationRequest` | Member payment verification |

### Fund Withdrawal

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/external/withdraw/client/` | Get client withdrawals |
| GET | `/external/withdraw/banks/` | Get withdrawal banks |
| GET | `/external/withdraw/settlementBanks/` | Get settlement banks |
| GET | `/external/withdraw-status/` | Get withdrawal status |
| POST | `/external/withdraw-request` | Withdraw request |
| POST | `/external/approval/withdraw-request` | Approve withdrawal request |

### External Banking

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/external/banks` | Get external banks |
| GET | `/external/approval` | Get approvals |
| GET | `/external/memberbankdetails/` | Get member bank details |
| GET | `/external/memberBankAssociatedProviderType` | Get provider type |
| POST | `/external/bankingtest` | Banking test |
| GET | `/external/settlementResponse/` | Get settlement response |
| POST | `/external/settlementRequest/` | Settlement request |

### Fund History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/external/history/client` | Get client history |
| GET | `/external/history/client/` | Get client history (alt) |
| GET | `/external/history/clientById/` | Get history by ID |
| GET | `/external/history/success/clientById/` | Get success history |
| POST | `/external/history/client/` | Post client history |
| POST | `/fundTransfer/history/client/` | Fund transfer history |

### MTF (Margin Trading Funding)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mtf/clients?activeStatus=` | Get MTF clients |
| GET | `/mtf/clients/invalid` | Get invalid MTF clients |
| POST | `/mtf/clients/invalid` | Invalid MTF clients |
| GET | `/mtf/security` | Get MTF security |
| POST | `/mtf/security/bulk` | Bulk MTF security |
| GET | `/mtm-margin/` | Get MTM margin |

---

## Market Data

### Market Watch

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/market-watch/` | Get market watch |
| GET | `/market-watch/user/` | Get user market watch |
| POST | `/market-watch/rename` | Rename market watch |
| POST | `/market-watch/delete/Security/` | Delete security from watch |

### Market Picture

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/marketPicture` | Get market picture |
| GET | `/marketPicture/gainersandlosers/` | Get gainers and losers |

### Market Session

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/marketSession` | Get market session |
| GET | `/markettypes` | Get market types |
| GET | `/markettypes/currentSession` | Get current session |
| GET | `/markettypes/orderplacement` | Get order placement session |
| GET | `/markettypes/session` | Get session types |

### Stock Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stock/securities` | Get securities |
| GET | `/stock/securitiesTicker` | Get securities ticker |
| GET | `/stock/securitiesWithInstrumentId/` | Get securities by instrument |
| GET | `/stock/order-placement-securities` | Get order placement securities |
| GET | `/stock/last-updated-time` | Get last updated time |
| GET | `/stock/validation` | Validate stock |
| GET | `/stock/validation/closing-price/` | Get closing price |

### Equity Price

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/equityprice` | Get equity price |
| GET | `/equityprice/` | Get equity price (alt) |
| POST | `/equityprice/` | Post equity price |
| GET | `/equityshare` | Get equity share |
| GET | `/equityshare/` | Get equity share (alt) |
| POST | `/equityshare` | Post equity share |

### Exchange Index

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/index/` | Get index |
| GET | `/index/exchangeIndex` | Get exchange index |
| GET | `/index/uniqueIndexCode/` | Get unique index code |
| GET | `/index/indexsecurity` | Get index security |
| POST | `/index/indexsecurity` | Post index security |
| POST | `/index/indexsecurity/bulk` | Bulk index security |

### Index Security

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/indexsecurity/` | Get index security |
| GET | `/company/sector` | Get company sectors |
| GET | `/company/instrumentType` | Get instrument types |

### Corporate Actions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/corporateactionsplits` | Get corporate action splits |
| GET | `/corporateactionsplits/refresh` | Refresh corporate actions |
| POST | `/corporateactionsplits` | Post corporate actions |

---

## Market Maker

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/market-maker/securities` | Get market maker securities |
| GET | `/market-maker/spreads` | Get spreads |
| GET | `/market-maker/isOrderUnique/` | Check order uniqueness |
| POST | `/market-maker/order/create` | Create market maker order |
| POST | `/market-maker/order/edit` | Edit market maker order |
| POST | `/market-maker/order/cancel` | Cancel market maker order |
| POST | `/market-maker/spread` | Post spread |

---

## RMS (Risk Management)

### Base Path: `/rmsApi`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rms/stats` | Get RMS stats |
| GET | `/rms/stats/client/` | Get client RMS stats |
| GET | `/rms/stats/dealer` | Get dealer RMS stats |
| GET | `/rms/stats/dealer/` | Get dealer RMS stats (alt) |
| GET | `/rms/stats/group` | Get group RMS stats |
| GET | `/rms/stats/group/` | Get group RMS stats (alt) |
| GET | `/rms/stats/member` | Get member RMS stats |

### RMS Limit Setup

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rms-limit-setup/` | Get RMS limit setup |
| GET | `/rms-limit-setup/group/` | Get group limit |
| GET | `/rms-limit-setup/collateral-mode` | Get collateral mode |
| GET | `/rms-limit-setup/trading-limit-heads` | Get trading limit heads |
| POST | `/rms-limit-setup` | Create RMS limit |
| PUT | `/rms-limit-setup` | Update RMS limit |
| POST | `/rms-limit-setup/group` | Create group limit |
| PUT | `/rms-limit-setup/groups` | Update group limits |
| PUT | `/rms-limit-setup/groups/collateral` | Update group collateral |
| PUT | `/rms-limit-setup/groups/orderLimit` | Update group order limit |
| PUT | `/rms-limit-setup/orderLimit` | Update order limit |
| POST | `/rms-limit-setup/cash-collateral` | Cash collateral |
| POST | `/rms-limit-setup/non-cash-collateral` | Non-cash collateral |
| POST | `/rms-limit-setup/collateral-statement` | Collateral statement |
| POST | `/rms-limit-setup/releaseCfs` | Release CFS |
| POST | `/rms-limit-setup/updateCfs` | Update CFS |

### Group Per Trade Limit

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/groupPerTradeLimit/${id}` | Get group per trade limit |
| POST | `/groupPerTradeLimit` | Create group per trade limit |
| PUT | `/groupPerTradeLimit` | Update group per trade limit |

---

## Company & Securities

### Company Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/company` | Get company |
| GET | `/company/` | Get company (alt) |
| GET | `/company/companybyuserid/` | Get company by user ID |
| GET | `/company/user/` | Get company user |
| GET | `/company/unique/isin/` | Get unique ISIN |
| GET | `/company/unique/symbol/` | Get unique symbol |
| GET | `/company/securities` | Get company securities |
| GET | `/company/securities/` | Get company securities (alt) |
| POST | `/company/securities/` | Post company securities |
| GET | `/company/news` | Get company news |
| POST | `/company/news` | Post company news |
| GET | `/company/instrumentType` | Get instrument types |
| POST | `/company-delisting/reasons` | Get delisting reasons |

### Share Group

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sharegroup/` | Get share groups |
| GET | `/sharegroup/refresh` | Refresh share groups |
| GET | `/sharegroup/uniquesharegroup/` | Get unique share group |
| POST | `/sharegroup/` | Post share group |

---

## Metadata & Administration

### Base Path: `/authApi`

#### Roles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/roles` | Get roles |
| GET | `/metadata/roles/` | Get roles (alt) |
| POST | `/metadata/roles` | Create role |
| PUT | `/metadata/roles` | Update role |
| PUT | `/metadata/roles/` | Update role (alt) |
| GET | `/metadata/roles/${id}` | Get role by ID |
| GET | `/metadata/uniqueRole/` | Get unique role |

#### User Types

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/usertype` | Get user types |
| GET | `/metadata/usertype/` | Get user types (alt) |
| POST | `/metadata/usertype` | Create user type |
| PUT | `/metadata/usertype` | Update user type |
| PUT | `/metadata/usertype/` | Update user type (alt) |
| GET | `/metadata/uniqueUserType/` | Get unique user type |
| GET | `/metadata/usertype/category/` | Get user type category |
| GET | `/metadata/usertype/department/` | Get user type department |
| GET | `/metadata/activeUsertypes` | Get active user types |
| POST | `/metadata/usertype/addFunc` | Add functionality |
| POST | `/metadata/usertype/removeFunc` | Remove functionality |
| POST | `/metadata/usertype/update` | Update user type |

#### Departments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/department` | Get departments |
| GET | `/metadata/department/` | Get departments (alt) |
| POST | `/metadata/department` | Create department |
| PUT | `/metadata/department` | Update department |
| DELETE | `/metadata/department/` | Delete department |
| GET | `/metadata/uniqueDepartment/` | Get unique department |
| GET | `/metadata/parentdepartment/` | Get parent department |
| GET | `/metadata/department-user-count` | Get department user count |

#### Designations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/designation` | Get designations |
| GET | `/metadata/designation/` | Get designations (alt) |
| POST | `/metadata/designation` | Create designation |
| PUT | `/metadata/designation` | Update designation |
| PUT | `/metadata/designation/` | Update designation (alt) |
| GET | `/metadata/uniqueDesignation/` | Get unique designation |

#### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/users` | Get users |
| GET | `/metadata/users/` | Get users (alt) |
| POST | `/metadata/users` | Create user |
| PUT | `/metadata/users` | Update user |
| PUT | `/metadata/users/` | Update user (alt) |
| GET | `/metadata/users/usertype/` | Get users by type |

#### Privileges

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/privileges` | Get privileges |
| GET | `/metadata/privileges/` | Get privileges (alt) |
| POST | `/metadata/privileges` | Create privilege |
| PUT | `/metadata/privileges` | Update privilege |
| PUT | `/metadata/privileges/` | Update privilege (alt) |

#### Functionalities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/functionalities` | Get functionalities |
| GET | `/metadata/functionalities/` | Get functionalities (alt) |
| POST | `/metadata/functionalities` | Create functionality |
| PUT | `/metadata/functionalities` | Update functionality |
| DELETE | `/metadata/functionalities/` | Delete functionality |
| GET | `/metadata/functionalitygroup` | Get functionality groups |

#### Branches

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/branch` | Get branches |
| POST | `/metadata/branch` | Create branch |
| PUT | `/metadata/branch` | Update branch |
| GET | `/metadata/branch/` | Get branches (alt) |

#### Menu

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/menu/` | Get menu |
| GET | `/metadata/menulist/` | Get menu list |
| GET | `/metadata/menuHierarchy/` | Get menu hierarchy |
| GET | `/metadata/submenu/` | Get submenu |

#### Mapping

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/rfp-mapping/role/` | Get role-function-privilege mapping |
| POST | `/metadata/rfp-mapping/role/` | Create RFP mapping |
| GET | `/metadata/ufr-mapping/user/` | Get user-function-privilege mapping |
| PUT | `/metadata/ufr-mapping/user/` | Update UFR mapping |

#### Miscellaneous

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metadata/unique/` | Get unique metadata |
| GET | `/metadata/countries` | Get countries |
| GET | `/metadata/birtip` | Get birth tips |
| GET | `/metadata/defaultRole/` | Get default role |
| GET | `/metadata/serverTime` | Get server time |
| GET | `/metadata/refresh` | Refresh metadata |
| POST | `/metadata/removeFile` | Remove file |
| GET | `/metadata/getupload/` | Get upload |

#### Nepali Location

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/nepal-location/province` | Get provinces |
| GET | `/nepal-location/district` | Get districts |
| GET | `/nepal-location/district-by-province/` | Get districts by province |
| GET | `/nepal-location/municipality-by-district/` | Get municipalities by district |

---

## User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/user` | Get users |
| GET | `/user/` | Get users (alt) |
| POST | `/user` | Create user |
| PUT | `/user/` | Update user |
| PUT | `/user/users` | Update users |
| GET | `/user/summary` | Get user summary |
| GET | `/user/unique/` | Check user uniqueness |
| GET | `/user/userByUsername/` | Get user by username |
| GET | `/user/usertype/` | Get user type |
| GET | `/user/designation/` | Get user designation |
| GET | `/user/stage/${id}` | Get user stage |
| GET | `/user/stage?${query}` | Get user stage (query) |
| GET | `/user/frlist` | Get FR list |
| POST | `/user/userPaged` | Get paginated users |
| POST | `/user/userRevoke` | Revoke user |
| POST | `/user/userSuspension` | Suspend user |
| POST | `/user/update-approval` | Update approval |
| PUT | `/user/enable` | Enable user |
| GET | `/user/userClientDealerType/` | Get user client dealer type |
| GET | `/user/mapClientWithUser/` | Map client with user |
| POST | `/user/mapClientWithUser/` | Map client with user (POST) |
| POST | `/user/removeClientMapping/` | Remove client mapping |
| GET | `/user/user-mapped-client/` | Get user mapped clients |
| POST | `/user/user-mapped-client/` | Get user mapped clients (POST) |
| GET | `/user/ufr-mapping/user/` | Get UFR mapping |
| PUT | `/user/ufr-mapping/user/` | Update UFR mapping |

---

## Dealer Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dealers/` | Get dealers |
| POST | `/dealers` | Create dealer |
| PUT | `/dealers/` | Update dealer |
| GET | `/dealers/member/` | Get member dealers |
| GET | `/dealers/unique/` | Check dealer uniqueness |
| GET | `/dealers/userdealer/` | Get user dealer |
| GET | `/dealers/userdealer/user/` | Get user dealer by user |
| PUT | `/dealers/userdealer/` | Update user dealer |
| GET | `/dealers/loginaudit/` | Get login audit |
| GET | `/dealers/loginaudit/dealer/` | Get dealer login audit |
| GET | `/dealers/loginaudit/status/` | Get login audit status |
| POST | `/dealers/loginaudit/` | Create login audit |
| PUT | `/dealers/loginaudit/` | Update login audit |

---

## Member Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/member` | Get member |
| GET | `/member/` | Get member (alt) |
| GET | `/member/memberCode` | Get member code |
| GET | `/member/status/` | Get member status |
| GET | `/member/assets/` | Get member assets |
| GET | `/member/cached` | Get cached member |
| GET | `/member/collateralTypes` | Get collateral types |
| GET | `/member/complaintType` | Get complaint type |
| GET | `/member/logo` | Get member logo |
| GET | `/member/memberBranch` | Get member branches |
| GET | `/member/memberBranchUnhidden` | Get visible member branches |
| GET | `/member/membershipType` | Get membership types |
| GET | `/member/memberOwnerType` | Get member owner types |
| GET | `/member/memberDisablementRules` | Get disablement rules |
| POST | `/member/save-membershipType` | Save membership type |
| POST | `/member/update-membershipType` | Update membership type |
| POST | `/member/disableMember` | Disable member |
| POST | `/member/collateralMemebershipMap` | Map collateral membership |
| GET | `/memberBranch` | Get member branch |

### Member Bank Details

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/memberBankDetails/getAllMemberBankDetails` | Get all member bank details |
| GET | `/memberBankDetails/getAllMemberAssociatedBanks` | Get associated banks |
| GET | `/memberBankDetails/getMemberBanksForJob` | Get member banks for job |
| GET | `/memberBankDetails/isInterBankEnabled/` | Check inter-bank enabled |
| GET | `/memberBankDetails/NCHLDefaultBank/` | Get NCHL default bank |
| POST | `/memberBankDetails/NCHLDefaultBank/update` | Update NCHL default bank |
| POST | `/memberBankDetails/addMemberBankDetails` | Add member bank details |
| POST | `/memberBankDetails/editMemberBankDetails` | Edit member bank details |
| POST | `/memberBankDetails/deleteMemberBankDetails` | Delete member bank details |

### Member Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/memberadmin/` | Get member admin |
| GET | `/memberadmin/limithead/C/` | Get limit head C |
| GET | `/memberadmin/limithead/D/` | Get limit head D |
| GET | `/memberadmin/limithead/G/` | Get limit head G |
| POST | `/memberadmin/limithead/CDH` | Create limit head CDH |
| POST | `/memberadmin/limithead/CGH` | Create limit head CGH |
| GET | `/memberadmin/member/exchange/membercollateral` | Get member collateral |
| GET | `/memberAdmin/tradingAlertSetups` | Get trading alert setups |
| POST | `/memberAdmin/tradingAlertSetupsDML` | Trading alert setups DML |

### Member Payment

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/memberPayment/details/` | Get member payment details |
| GET | `/memberPayment/paymentLoginPopUp/` | Get payment login popup |
| GET | `/memberPayment/totalPaymentDue/` | Get total payment due |

---

## Application Workflow

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/application` | Get applications |
| GET | `/application/` | Get applications (alt) |
| GET | `/application/applicationtype` | Get application types |
| GET | `/application/applicationtype/` | Get application types (alt) |
| GET | `/application/approvallevel` | Get approval levels |
| GET | `/application/type/` | Get application type |
| GET | `/application/typegroup/` | Get application type group |
| GET | `/application/typegroup/EXCHANGEINDEX` | Get exchange index type group |
| GET | `/application/typegroup/MEMBERSHIP` | Get membership type group |
| GET | `/application/document` | Get application documents |
| GET | `/application/partial?session=` | Get partial application by session |
| GET | `/application/partial?userid=` | Get partial application by user |
| GET | `/application/session?apptypeid=` | Get application session |
| POST | `/application/applicationtype` | Create application type |
| PUT | `/application/applicationtype` | Update application type |
| DELETE | `/application/applicationtype/` | Delete application type |
| POST | `/application/approvallevel` | Create approval level |
| PUT | `/application/approvallevel` | Update approval level |
| DELETE | `/application/approvallevel/` | Delete approval level |
| POST | `/application/document` | Create application document |
| PUT | `/application/document` | Update application document |
| DELETE | `/application/document/` | Delete application document |
| POST | `/application/partial` | Save partial application |
| DELETE | `/application/session/` | Delete application session |
| DELETE | `/application/session?session=` | Delete application session (query) |
| GET | `/application/memberApplication/` | Get member application |
| GET | `/application/companyApplication/` | Get company application |
| GET | `/application/memberCreation/` | Get member creation |
| GET | `/application/memberEnablement/` | Get member enablement |
| GET | `/application/client/` | Get client application |
| GET | `/application/appId/client/` | Get app ID by client |
| GET | `/application/appTypeId/client/` | Get app type ID by client |
| GET | `/application/checkARCRApplicationByClientId/` | Check ARCR application |
| GET | `/application/checkClientCreationApplicationByClientId/` | Check client creation application |
| POST | `/application/online-registration` | Online registration |
| POST | `/application/approve` | Approve application |
| POST | `/application/reject` | Reject application |
| POST | `/application/forward` | Forward application |
| POST | `/application` | Create application |

---

## Collateral Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/collateral-statement` | Get collateral statement |
| GET | `/collateral-statement/` | Get collateral statement (alt) |
| GET | `/collateral/branch` | Get collateral branch |
| GET | `/collateral/branch/client` | Get client collateral branch |
| GET | `/collateral/branch/detail` | Get collateral branch detail |
| GET | `/collateral/all/client/` | Get all client collateral |
| GET | `/collateral/client/` | Get client collateral |
| GET | `/collateral-detail/distinct/multiplication-factor` | Get multiplication factor |
| POST | `/collateral/cfsStatus/` | Get CFS status |

---

## Net Settlement

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/net-settlement/client/` | Get client settlement |
| GET | `/net-settlement/collateralDetails/` | Get collateral details |
| GET | `/net-settlement/report/` | Get settlement report |
| POST | `/net-settlement` | Create net settlement |
| POST | `/net-settlement/cancel` | Cancel settlement |
| POST | `/net-settlement/clientDailyPaymentDetail` | Client daily payment detail |
| POST | `/net-settlement/from-collateral` | From collateral |
| POST | `/net-settlement/to-collateral` | To collateral |
| POST | `/net-settlement/manual` | Manual settlement |
| POST | `/net-settlement/eod-pay-out/approve?payment_via=` | EOD pay-out approve |

---

## Fund Transfer

### Settlement Payment

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/settlementPayment/` | Get settlement payment |
| GET | `/settlementPayment/fundManagementDashboard` | Get fund management dashboard |
| GET | `/settlementPayment/payment-detail/` | Get payment detail |
| GET | `/settlementPayment/getFMDNetTransaction` | Get FMD net transaction |
| GET | `/settlementPayment/getPaymentDueTransactions` | Get payment due transactions |
| GET | `/settlementPayment/getSettlementSummary?clientId=` | Get settlement summary |
| GET | `/settlementPayment/getSettlementTransactionDetails?clientDealerId=` | Get settlement transaction details |
| GET | `/settlementPayment/getApprovedClientDailyPaymentDetails/` | Get approved daily payment details |
| POST | `/settlementPayment/` | Create settlement payment |
| POST | `/settlementPayment/approval` | Approve settlement payment |
| POST | `/settlementPayment/cancel-approval` | Cancel approval |
| POST | `/settlementPayment/manualSettlement` | Manual settlement |

### Trade Settlement

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/trade-settlement/get-table-data` | Get trade settlement table data |

---

## NCHL Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/NCHL-Bank/all` | Get all NCHL banks |
| POST | `/nchl-account-validation/validate` | Validate NCHL account |
| POST | `/nchl-account-validation/validate/client` | Validate client NCHL account |
| POST | `/nchl-account-validation/validate/member` | Validate member NCHL account |
| GET | `/nchl-account-validation/check-validity/client/` | Check NCHL validity |
| GET | `/nchlEodPayout/nchlHistory/client/` | Get NCHL history |
| GET | `/nchlEodPayout/nchlHistory/clientById/` | Get NCHL history by ID |
| GET | `/nchlEodPayout/runNCHLEodPayoutJob?payoutType=` | Run NCHL EOD payout job |
| GET | `/nchlEodPayout/runNCHLIndividualVerification?payoutType=` | Run NCHL individual verification |
| GET | `/onlineFundTransfer/tnx-batch?payoutType=` | Get online fund transfer batch |

---

## Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notification` | Get notifications |
| GET | `/notification?count=${id}` | Get notification count |
| GET | `/notification/count/` | Get notification count |
| PUT | `/notification/notification-mark-as-read` | Mark as read |
| PUT | `/notification/read-notification` | Read notification |
| PUT | `/notification/reset/` | Reset notification |
| PUT | `/notification/resetNotification` | Reset notification (alt) |

---

## Audit & Reporting

### Audit Trail

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/audit/columns/` | Get audit columns |
| GET | `/audit/data/` | Get audit data |
| GET | `/audit/tables` | Get audit tables |

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/report/` | Get reports |
| GET | `/report/allReportGroups` | Get all report groups |
| GET | `/report/reportGroup/` | Get report group |
| GET | `/report/reportGroupByUser` | Get report group by user |
| GET | `/report/reportInputParameters/` | Get report input parameters |
| GET | `/report/userType/` | Get user type reports |
| POST | `/report/addReportsUserType` | Add reports user type |
| POST | `/report/deleteReportsUserType` | Delete reports user type |
| POST | `/report/brokerwise-floorsheet-report` | Brokerwise floorsheet report |
| GET | `/report/brokerwise-floorsheet-report/` | Get brokerwise floorsheet report |
| GET | `/reports/funds-pay-in-pay-out-report/` | Get funds pay-in/pay-out report |
| GET | `/reports/pay-in-report-data/` | Get pay-in report data |
| GET | `/reports/pay-out-report-data/` | Get pay-out report data |
| POST | `/generate/contract/email/` | Generate contract email |

### Admin Message Log

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/adminClientMessageLog/adminmessages/` | Get admin messages |
| GET | `/adminClientMessageLog/clientDealerData` | Get client dealer data |
| GET | `/adminClientMessageLog/getAdmin` | Get admin |
| GET | `/adminClientMessageLog/messages/` | Get messages |
| POST | `/adminClientMessageLog/sendMessage/` | Send message |

---

## Configuration & System

### System Options

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/systemoptions` | Get system options |
| GET | `/systemoptions/` | Get system options (alt) |
| GET | `/systemoptions/cached/` | Get cached system options |
| POST | `/systemoptions/add` | Add system option |
| PUT | `/systemoptions` | Update system option |
| PUT | `/systemoptions/update` | Update system option (alt) |

### Financial Year

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/financial-year` | Get financial year |
| GET | `/CompanyFinancialYear/` | Get company financial year |

### Session

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/session/` | Get session |
| POST | `/session/invalidate/` | Invalidate session |

### Products & Instruments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/products` | Get products |
| GET | `/products/productlist` | Get product list |
| GET | `/series` | Get series |
| GET | `/instrumentType` | Get instrument types |
| GET | `/instrumentType/active` | Get active instrument types |
| GET | `/providerType` | Get provider types |
| GET | `/account-type/accountypes` | Get account types |

### Banks & Branches

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/banks/active` | Get active banks |
| GET | `/banks/getBanksWithEbanking` | Get banks with e-banking |
| GET | `/bankBranch/getBranchByBankId/` | Get bank branches |

### Holidays

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/holiday` | Get holidays |
| GET | `/holiday/` | Get holidays (alt) |
| POST | `/holiday` | Create holiday |
| PUT | `/holiday` | Update holiday |
| DELETE | `/holiday/` | Delete holiday |

### Operating Parameters

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/operating-param` | Get operating parameters |
| GET | `/brokerage-slab` | Get brokerage slab |
| GET | `/commission-fee-setup` | Get commission fee setup |
| GET | `/reasoncode` | Get reason codes |
| POST | `/reasoncode` | Create reason code |
| GET | `/categorymapping/` | Get category mappings |
| GET | `/categorymapping/businesstypes` | Get business types |
| GET | `/categorymapping/company-types` | Get company types |
| GET | `/categorymapping/designations` | Get designations |
| GET | `/categorymapping/financial-details` | Get financial details |
| GET | `/categorymapping/occupation` | Get occupations |
| GET | `/categorymapping/relations` | Get relations |
| GET | `/categorymapping/risk-types` | Get risk types |
| POST | `/categorymapping` | Create category mapping |
| PUT | `/categorymapping` | Update category mapping |
| DELETE | `/categorymapping/activate/` | Activate category |
| DELETE | `/categorymapping?id=` | Delete category |

### Exchange

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/exchange/` | Get exchange |
| GET | `/exchange/connection-log` | Get connection log |
| GET | `/exchange/exchange-messages` | Get exchange messages |
| GET | `/exchange/initmarginfactory` | Get init margin factory |
| GET | `/exchange/logs` | Get exchange logs |
| GET | `/exchange/marketwatch` | Get marketwatch |
| GET | `/exchange/news` | Get news |
| GET | `/exchange/status` | Get status |
| GET | `/exchangeMembers` | Get exchange members |

### Security Delisting

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/securitydelisting` | Get security delisting |
| GET | `/securitydelisting/` | Get security delisting (alt) |
| POST | `/securitydelisting/` | Create security delisting |

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard/businessDate` | Get business date |

### Admin Cache

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/vCache/clientCache/` | Get client cache |
| GET | `/admin/vCache/clientCacheByClientCode/` | Get client cache by code |
| GET | `/admin/vCache/order-placement-cache` | Get order placement cache |

### Grievance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/grievance/reason` | Get grievance reasons |
| GET | `/grievance/reason-code/` | Get grievance reason code |

---

## File Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/file-io/generate-ucc/` | Generate UCC |
| POST | `/file-io/update-ucc` | Update UCC |
| GET | `/document/deletable/` | Check if deletable |

---

## Scheduling

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/scheduling/manual/job/` | Run manual job |

---

## ME Login (Member Exchange)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/MElogin/request` | ME login request |
| POST | `/MElogin/logout` | ME logout |

---

## Ticker

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ticker/place-mapping` | Place ticker mapping |

---

## Miscellaneous

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/someting` | Health check |

---

## Summary Statistics

| Category | GET | POST | PUT | DELETE | Total |
|----------|-----|------|-----|--------|-------|
| Authentication | 2 | 11 | 1 | 0 | 14 |
| Order Management | 25 | 12 | 0 | 0 | 37 |
| Trade & Settlement | 15 | 0 | 0 | 0 | 15 |
| Client Management | 45 | 15 | 0 | 0 | 60 |
| Fund Management | 35 | 20 | 0 | 0 | 55 |
| Market Data | 30 | 5 | 0 | 0 | 35 |
| Market Maker | 3 | 4 | 0 | 0 | 7 |
| RMS | 8 | 5 | 4 | 0 | 17 |
| Company & Securities | 10 | 3 | 0 | 0 | 13 |
| Metadata & Admin | 40 | 10 | 8 | 3 | 61 |
| User Management | 15 | 5 | 3 | 0 | 23 |
| Dealer Management | 8 | 3 | 3 | 0 | 14 |
| Member Management | 18 | 5 | 2 | 0 | 25 |
| Application Workflow | 15 | 10 | 3 | 3 | 31 |
| Collateral Management | 8 | 1 | 0 | 0 | 9 |
| Net Settlement | 3 | 7 | 0 | 0 | 10 |
| Fund Transfer | 10 | 3 | 0 | 0 | 13 |
| NCHL Integration | 5 | 3 | 0 | 0 | 8 |
| Notifications | 3 | 0 | 3 | 0 | 6 |
| Audit & Reporting | 8 | 3 | 0 | 0 | 11 |
| Configuration | 25 | 5 | 5 | 3 | 38 |
| File Operations | 1 | 1 | 0 | 0 | 2 |
| Other | 5 | 2 | 1 | 0 | 8 |
| **Total** | **247** | **128** | **33** | **9** | **417** |

---

*Generated from main.1c45efd6c2461ebc48bd.js (7.7MB) on 2026-09-08*
