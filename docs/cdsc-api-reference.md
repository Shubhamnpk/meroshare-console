# CDSC MeroShare API Reference

Complete documentation of the CDSC MeroShare backend API endpoints as used by this application.

**Base URL**: `https://webbackend.cdsc.com.np`  
**IPO Result URL**: `https://iporesult.cdsc.com.np`  
**Frontend Origin**: `https://meroshare.cdsc.com.np`

---

## Table of Contents

1. [Authentication](#authentication)
2. [User Profile](#user-profile)
3. [Bank Management](#bank-management)
4. [IPO & Share Management](#ipo--share-management)
5. [Application Reports](#application-reports)
6. [Portfolio & Holdings](#portfolio--holdings)
7. [Transactions](#transactions)
8. [WACC (Weighted Average Cost of Capital)](#wacc-weighted-average-cost-of-capital)
9. [EDIS (Electronic Delivery Instruction System)](#edis-electronic-delivery-instruction-system)
10. [Security](#security)
11. [Activity Log](#activity-log)
12. [Error Handling](#error-handling)
13. [Request Headers](#request-headers)
14. [Response Formats](#response-formats)

---

## Authentication

### Login

```
POST /api/meroShare/auth/
```

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "captchaId": "string",
  "captchaValue": "string"
}
```

**Response:**
```json
{
  "message": "Logged in successfully.",
  "token": "Bearer {jwt_token}",
  "demat": "string (BOID)",
  "boid": "string (BOID)",
  "clientCode": "string"
}
```

### Logout

```
GET /api/meroShare/auth/logout/
```

**Headers:** `Authorization: Bearer {token}`

---

## User Profile

### Get Own Detail

```
GET /api/meroShare/ownDetail/
```

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "demat": "string",
  "boid": "string",
  "clientCode": "string",
  "clientName": "string",
  "email": "string",
  "mobileNumber": "string",
  "crnNumber": "string"
}
```

### Get My Detail by BOID

```
GET /api/meroShareView/myDetail/{boid}
```

**Parameters:**
- `boid` (path, string): BOID of the user

---

## Bank Management

### Get Bank List

```
GET /api/meroShare/bank/
```

**Response:** Array of bank objects

### Get Bank Detail

```
GET /api/meroShare/bank/{bankId}
```

**Parameters:**
- `bankId` (path, number): Bank ID

**Response:**
```json
[
  {
    "id": 123,
    "accountNumber": "0123456789",
    "branchName": "Kathmandu Branch",
    "accountBranchId": 456,
    "accountTypeId": 789,
    "accountTypeIdMap": "Savings",
    "accountType": "Savings",
    "bankName": "Nabil Bank"
  }
]
```

**Note:** This endpoint returns an **array** of customer objects for the authenticated user. Each object contains:
- `id` → Use as `customerId`
- `accountBranchId` → Use in application payload
- `accountTypeId` → Use in application payload
- `accountNumber` → Display and use in application

### Get Bank Request (CRN/ Branch Info)

```
GET /api/bankRequest/{bankCode}
```

**Parameters:**
- `bankCode` (path, string): Bank code

**Response:**
```json
{
  "crn": "string",
  "branchName": "string",
  "bankName": "string"
}
```

---

## IPO & Share Management

### Get Applicable Issues

```
POST /api/meroShare/companyShare/applicableIssue/
```

**Request Body:**
```json
{
  "filterFieldParams": [
    { "key": "companyIssue.companyISIN.script", "alias": "Scrip" },
    { "key": "companyIssue.companyISIN.company.name", "alias": "Company Name" },
    { "key": "companyIssue.assignedToClient.name", "value": "", "alias": "Issue Manager" }
  ],
  "page": 1,
  "size": 50,
  "searchRoleViewConstants": "VIEW_APPLICABLE_SHARE",
  "filterDateParams": [
    { "key": "minIssueOpenDate", "condition": "", "alias": "", "value": "" },
    { "key": "maxIssueCloseDate", "condition": "", "alias": "", "value": "" }
  ]
}
```

**Response:** Paged list of applicable issues

### Get Current Issues (Open/Upcoming/Recently Closed)

```
POST /api/meroShare/companyShare/currentIssue
```

**Request Body:**
```json
{
  "filterFieldParams": [
    { "key": "companyIssue.companyISIN.script", "alias": "Scrip" },
    { "key": "companyIssue.companyISIN.company.name", "alias": "Company Name" },
    { "key": "companyIssue.assignedToClient.name", "value": "", "alias": "Issue Manager" }
  ],
  "page": 1,
  "size": 200,
  "searchRoleViewConstants": "VIEW_OPEN_SHARE",
  "filterDateParams": [
    { "key": "minIssueOpenDate", "condition": "", "alias": "", "value": "" },
    { "key": "maxIssueCloseDate", "condition": "", "alias": "", "value": "" }
  ]
}
```

### Check Can Apply

```
GET /api/meroShare/applicantForm/customerType/{companyShareId}/{demat}
```

**Parameters:**
- `companyShareId` (path, number): Company share ID
- `demat` (path, string): BOID

### Get Issue Manager Detail

```
GET /api/meroShare/active/{companyShareId}
```

**Parameters:**
- `companyShareId` (path, number): Company share ID

---

## Application Reports

### Get Active Applications

```
POST /api/meroShare/applicantForm/active/search/
```

**Request Body:**
```json
{
  "filterFieldParams": [
    { "key": "companyShare.companyIssue.companyISIN.script", "alias": "Scrip" },
    { "key": "companyShare.companyIssue.companyISIN.company.name", "alias": "Company Name" }
  ],
  "page": 1,
  "size": 200,
  "searchRoleViewConstants": "VIEW_APPLICANT_FORM_COMPLETE",
  "filterDateParams": [
    { "key": "appliedDate", "condition": "", "alias": "", "value": "" },
    { "key": "appliedDate", "condition": "", "alias": "", "value": "" }
  ]
}
```

### Get Migrated Applications

```
POST /api/meroShare/migrated/applicantForm/search/
```

**Request Body:** Same as active applications

### Get Application Detail

```
GET /api/meroShare/applicantForm/report/detail/{formId}
```

**Parameters:**
- `formId` (path, number): Application form ID

### Get Migrated Application Detail

```
GET /api/meroShare/migrated/applicantForm/report/{formId}
```

---

## Portfolio & Holdings

### Get Portfolio

```
POST /api/meroShareView/myPortfolio/
```

**Request Body:**
```json
{
  "sortBy": "script",
  "demat": ["BOID"],
  "clientCode": "string",
  "page": 1,
  "size": 500,
  "sortAsc": true
}
```

**Response:**
```json
{
  "object": [
    {
      "script": "symbol",
      "companyName": "string",
      "quantity": 100,
      "blockedQuantity": 0,
      "availableQuantity": 100,
      "averagePrice": 100.00,
      "currentPrice": 105.00,
      "gainLoss": 500.00,
      "gainLossPercent": 5.00
    }
  ],
  "totalPages": 1,
  "totalElements": 10
}
```

### Get My Shares

```
GET /api/meroShareView/myShare/
```

**Response:** Array of share holdings

---

## Transactions

### Get Transactions

```
POST /api/meroShareView/myTransaction/
```

**Request Body:**
```json
{
  "boid": "string (BOID)",
  "clientCode": "string",
  "script": "SYMBOL or null",
  "fromDate": null,
  "toDate": null,
  "requestTypeScript": false,
  "page": 1,
  "size": 200
}
```

**Response:**
```json
{
  "transactionView": [
    {
      "transactionDate": "2024-01-01",
      "script": "symbol",
      "transactionType": "BUY or SELL",
      "quantity": 100,
      "price": 100.00,
      "amount": 10000.00
    }
  ],
  "totalItems": 100
}
```

---

## WACC (Weighted Average Cost of Capital)

### Get WACC Pending Scrips

```
GET /api/myPurchase/share/
```

**Response:** Array of scrips pending WACC calculation

### Get WACC Pending (Search)

```
POST /api/myPurchase/search/wacc/
```

**Request Body:**
```json
{
  "demat": "string (BOID)",
  "scrip": "SYMBOL"
}
```

### Get Calculated WACC

```
POST /api/myPurchase/view/
```

**Request Body:**
```json
{
  "demat": "string (BOID)",
  "scrip": "SYMBOL"
}
```

### Submit WACC

```
POST /api/myPurchase/upload/
```

**Request Body:**
```json
[
  {
    "scrip": "SYMBOL",
    "quantity": 100,
    "price": 100.00,
    "isEdit": true
  }
]
```

### Get WACC Report

```
POST /api/myPurchase/waccReport/
```

**Request Body:**
```json
{
  "demat": "string (BOID)"
}
```

**Response:**
```json
{
  "isWaccPending": false,
  "viewWaccSummaryReport": true,
  "waccReportResponse": [
    {
      "scrip": "SYMBOL",
      "wacc": 100.00,
      "totalQuantity": 100
    }
  ]
}
```

---

## EDIS (Electronic Delivery Instruction System)

### Get Active Transfers

```
POST /api/EDIS/transfer/active/
```

**Request Body:**
```json
{
  "filterFieldParams": [
    { "key": "requestStatus.name", "value": "", "alias": "Status" },
    { "key": "contractObligationMap.obligation.settleId", "alias": "Settlement Id" },
    { "key": "contractObligationMap.obligation.scriptCode", "alias": "Scrip" },
    { "key": "contractObligationMap.obligation.clientBoid", "alias": "BOID" },
    { "key": "contractObligationMap.obligation.sellClient", "value": "", "alias": "Client Code" }
  ],
  "page": 1,
  "size": 50,
  "searchRoleViewConstants": "VIEW_EDIS_TRANSFER",
  "filterDateParams": [
    { "key": "settlementDate", "value": "", "condition": "", "alias": "" },
    { "key": "settlementDate", "value": "", "condition": "", "alias": "" }
  ]
}
```

### Get Transfer Detail

```
GET /api/EDIS/transfer/detail/{transferId}
```

**Parameters:**
- `transferId` (path, number): Transfer ID

### Check Transfer

```
POST /api/EDIS/transfer/check/
```

**Request Body:** Array of transfer request objects

### Submit Transfer

```
POST /api/EDIS/transfer/
```

**Request Body:** Array of transfer request objects

### Get Nodal Trades

```
POST /api/EDIS/nodel/
```

**Request Body:**
```json
{
  "filterFieldParams": [
    { "key": "requestStatus.name", "value": "", "alias": "Status" },
    { "key": "contractObligationMap.obligation.scriptCode", "alias": "Scrip" },
    { "key": "contractObligationMap.obligation.clientBoid", "alias": "BOID" }
  ],
  "page": 1,
  "size": 50,
  "searchRoleViewConstants": "VIEW_EDIS_TRANSFER",
  "filterDateParams": [
    { "key": "settlementDate", "value": "", "condition": "", "alias": "" },
    { "key": "settlementDate", "value": "", "condition": "", "alias": "" }
  ]
}
```

### Get EDIS Statuses

```
GET /api/EDIS/statusName/
```

**Response:** Array of status objects

### Get EDIS Disclaimer

```
GET /api/EDIS/disclaimer/
```

**Response:**
```json
{
  "fieldValue": "Disclaimer text..."
}
```

### Check Pool Account

```
GET /api/EDIS/accountType/check/
```

**Response:**
```json
{
  "isPoolAccount": false
}
```

### Check WACC Left

```
GET /api/EDIS/check/
```

**Response:**
```json
{
  "fieldValue": "true" or "false"
}
```

---

## Security

### Change Password

```
POST /api/meroShare/changePassword/
```

**Request Body:**
```json
{
  "oldPassword": "string",
  "newPassword": "string",
  "confirmPassword": "string"
}
```

### Change Transaction PIN

```
POST /api/meroShare/changeTransactionPIN/
```

**Request Body:**
```json
{
  "oldTransactionPIN": "string",
  "newTransactionPIN": "string",
  "confirmTransactionPIN": "string"
}
```

---

## Activity Log

### Search Activity Log

```
POST /api/meroShare/activityLog/search/
```

**Request Body:**
```json
{
  "filterFieldParams": [{ "key": "browserName" }],
  "page": 1,
  "size": 100,
  "searchRoleViewConstants": "VIEW",
  "filterDateParams": [
    {
      "key": "recordedDate",
      "condition": "",
      "alias": "",
      "value": "BETWEEN '2024-01-01' AND '2024-01-31 23:59:59'"
    },
    { "key": "recordedDate", "condition": "", "alias": "", "value": "" }
  ]
}
```

**Response:**
```json
{
  "object": [
    {
      "recordedDate": "2024-01-15 10:30:00",
      "browserName": "Chrome 124.0",
      "ipAddress": "192.168.1.1",
      "activityType": "LOGIN",
      "description": "User logged in successfully"
    }
  ],
  "totalPages": 5,
  "totalElements": 500
}
```

---

## Error Handling

### Error Response Format

```json
{
  "message": "Error description",
  "error": "error code",
  "status": 400
}
```

### Common HTTP Status Codes

| Status | Description |
|--------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Session expired |
| 403 | Forbidden - Access denied |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### Error Handling in Code

```typescript
import { CdscError } from "./cdsc.server";

try {
  const data = await cdscRequest(url, { token });
} catch (error) {
  if (error instanceof CdscError) {
    console.error(`CDSC Error ${error.status}: ${error.message}`);
    // Handle specific error codes
    if (error.status === 401) {
      // Session expired
    } else if (error.status === 403) {
      // Access denied
    }
  }
}
```

---

## Request Headers

### Required Headers

```typescript
{
  "Accept": "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "Connection": "keep-alive",
  "Origin": "https://meroshare.cdsc.com.np",
  "Referer": "https://meroshare.cdsc.com.np/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Authorization": "Bearer {token}"
}
```

---

## Response Formats

### Success Response

```json
{
  "data": "response data",
  "message": "Success message"
}
```

### Paged Response

```json
{
  "object": [],
  "totalPages": 1,
  "totalElements": 10,
  "number": 0,
  "size": 20
}
```

---

## Rate Limiting

The CDSC API implements rate limiting:
- Maximum 3 retry attempts for transient failures (429, 500, 502, 503, 504)
- Exponential backoff: 350ms * attempt number
- Write operations are not retried

---

## Session Management

- **Session TTL**: 2 hours (CDSC-enforced)
- **Token Format**: `Bearer {jwt_token}`
- **Storage**: HttpOnly session cookie (server-side)
- **Refresh**: Not supported - must re-login after expiration

---

## Key Differences from NEPSE TMS

| Feature | CDSC MeroShare | NEPSE TMS |
|---------|---------------|-----------|
| **Framework** | Angular JS (legacy) | Angular (modern) |
| **Auth** | Bearer token (2hr TTL) | JWT + XSRF-TOKEN |
| **Search Pattern** | POST with filterFieldParams | GET with query params |
| **Pagination** | page/size in body | Query parameters |
| **Real-time** | None (polling) | WebSocket |
| **Order Management** | None (IPO only) | Full trading |
| **User Roles** | Single role | Multiple roles |
| **Base URL** | `webbackend.cdsc.com.np/api/` | `tms77.nepsetms.com.np/` |

---

## API Endpoints Summary

| Category | Endpoints |
|----------|-----------|
| Authentication | 2 |
| User Profile | 2 |
| Bank Management | 3 |
| IPO & Share Management | 4 |
| Application Reports | 4 |
| Portfolio & Holdings | 2 |
| Transactions | 1 |
| WACC | 5 |
| EDIS | 7 |
| Security | 2 |
| Activity Log | 1 |
| **Total** | **33** |

---

*Generated from source code on 2026-09-08*
