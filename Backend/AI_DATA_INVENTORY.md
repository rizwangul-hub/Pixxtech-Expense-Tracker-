# PIXx AI database inventory and implementation plan

Discovery: 6 November 2026. Generated from the actual registered Mongoose schemas before application changes. No live database connection, financial mutation, or provider call was used. The scope is the Pakistan application only.

## Relationships and authoritative calculations

- Journal: Transaction links Voucher, debit/credit Account, Category, Property, embedded unitId, Tenant and RentalAgreement. There is no Transaction.employeeId or vendor collection. Employee-related transactions must use recorded Payroll transaction/installment links; narration matches are search results, not a verified employee relationship.
- Accounts: BANK/CASH/SUSPENSE; opening balance plus debit-in/credit-out movement. Reuse ledgerService.getAccountRunningLedger, accountBalance.calculateLiveAccountBalances and ledgerPresentation.getLiquidityStatementAmounts. Bank/cash statement debit means out and credit means in; suspense uses journal debit/credit. Never swap these conventions silently.
- Employees: Employee -> Payroll (employeeId + payrollMonth unique), StaffLoan, Attendance and StaffLeave. Profile grossSalary is an existing virtual. Payroll calculation and salary accrual/payment ledgers are separate from profile salary. Reuse payrollController.getEmployeeLedger and salaryReportingService; never call payroll generation/payment/reversal writers.
- Loans: StaffLoan records DISBURSEMENT/REPAYMENT with stored previousBalance/newBalance; Employee.loanBalance is the current snapshot. StaffLoan has no voucher/transaction reference or void status. Do not invent those links or total only the latest page.
- Attendance: recorded dateStr, arrival/shift times, status and lateMinutes. No clock-out, early-departure, working-hours, or biometric fields exist. Missing records are not absences. StaffLeave intervals and approvals are separate.
- Properties: Property embeds units; there is no Unit model. Units link rental accounts and retain a July receivable baseline. RentalAgreement links tenant/property/unit. Rental allocation reports must reuse rentalCarryForwardService with rentOnly=true, explicit rentMonth precedence, and the existing September 2026 baseline/current-active-agreement limitation. Tenant invoice/payment ledgers use RentDue and RentReceived and must be labeled separately from allocated rental cash flow. No purchase-price or valuation fields exist.
- Categories: Category has parentCategoryId, scope/classification, property/unit, report exclusions and rental flags. Reuse getHeadWiseExpenseReport/groupExpenseTransactionsByReportHead and expenseClassificationService; filtering one child must not return its siblings. OtherIncome links OtherIncomeHead and the posted Transaction/Voucher; do not double count both collections.
- Verification: PendingEntry is staging, not posted finance. DATA_ENTRY may read only its own pending entries; existing verifier/admin permissions retain their broader queue access. Financial totals never include pending staging. Voucher DRAFT/VOID/REVERSED metadata may be inspected but is not a posted financial total.
- User/JWT/RBAC: preserve middleware/auth.js and VIEW_FINANCIALS. All five configured roles currently have organization-wide financial report access; no organization/tenant ownership field exists in these schemas. Do not invent createdBy-based ownership for global reports. User passwords, token versions, bank identifiers, CNIC and unnecessary personal details are not assistant output.
- Operational/private models: communications are private participant-scoped data, backups/system updates/audit documents have separate admin workflows, and rate limits are operational. Inventory them but never expose private messages, backup paths/blobs, tokens, IP addresses, credential fields, or raw audit payloads as finance tools.

## Missing or incorrect assistant behavior found

- Static employee/account/property dictionaries cannot cover registered names. Partial findOne plus first-token fallback can choose the wrong entity; missing filters can broaden to all records.
- Account statements stop at 20/25 rows, payroll statements at 100, and loan totals use ten recent records. There is no next-page contract.
- Transaction narration reads nonexistent narration instead of detail. Individual salary fallback omits allowance components and can mistake configured salary for posted payroll.
- Provider fallback refers to an unimported resolver and silently tries additional models. Date/filter context is reconstructed from six untrusted user questions, not verified per-conversation state.
- Central ledger and rent reports use different meaningful accounting bases. Its raw entity subtexts include private identifiers, so assistant adapters must project safe fields rather than return controllers wholesale.

## Implementation sequence

1. Add strict business-tool schemas, shared Pakistan date/page validation, safe projections, dynamic name/alias matching and explicit ambiguity responses.
2. Add read-only report/ledger adapters with opening/closing/running balances appropriate to each entity, full-scope totals and explicit pagination; reuse existing production calculation helpers.
3. Extend the existing tool registry for directory/universal search, profiles, payroll, loans, attendance/leaves, bank/cash statements, vouchers/transactions, expenses/income, properties/units, tenants and verification metadata.
4. Keep the same provider/endpoint; validate complete tool plans, prevent entity-filter loss, and bind signed bounded context to the authenticated user, token version and conversation. Never send financial results to a provider or accept model writes.
5. Extend the existing chat with structured report tables, matching-entity choices, filters, pagination, next-page follow-ups and permission-gated exports supported by existing report services.
6. Test real production helpers with deterministic realistic model fixtures, mocked Gemini/OpenAI, English/Roman Urdu/typos/follow-ups, ambiguity, dates, pagination and cross-user attacks. Preserve existing assertions and expand fixture contracts only when needed.
7. Run the maintained backend suite, legacy helper suites, frontend lint/build and browser smoke checks. Document demonstrated fixture outputs, limits and deployment steps. Do not deploy.

## Complete schema field inventory

Every model below is the source model name; refs show actual schema relationships. Standard _id/createdAt/updatedAt/__v fields are omitted from the list for readability. This file contains field metadata only, never database records.

### Account

- name (String)
- accountName (String)
- accountCode (String)
- type (String; BANK, CASH, SUSPENSE)
- accountType (String; BANK, CASH, SUSPENSE)
- ownerName (String)
- bankName (String)
- cashHolder (String)
- accountNumber (String)
- iban (String)
- branch (String)
- currency (String)
- openingBalance (Number)
- openingBalanceDate (Date)
- currentBalance (Number)
- isActive (Boolean)
- isClearing (Boolean)
- notes (String)
- createdBy (ref User)
- updatedBy (ref User)

### AssistantRateLimit

- key (String)
- count (Number)
- resetAt (Date)

### Attendance

- employeeId (ref Employee)
- date (Date)
- dateStr (String)
- shiftOpeningTime (String)
- arrivalTime (String)
- status (String; PRESENT, LATE, ABSENT, HALF_DAY, LEAVE, NOT_JOINED)
- lateMinutes (Number)
- remarks (String)

### AuditLog

- userId (ref User)
- userName (String)
- userEmail (String)
- userRole (String)
- action (String)
- module (String)
- recordType (String)
- recordId (String)
- status (String; SUCCESS, FAILURE)
- description (String)
- changes.previous (Mixed)
- changes.updated (Mixed)
- ipAddress (String)
- userAgent (String)
- metadata (Mixed)
- timestamp (Date)

### BackupRecord

- backupMonth (String)
- filename (String)
- storagePath (String)
- description (String)
- backupVersion (String)
- schemaVersion (String)
- checksum (String)
- sizeBytes (Number)
- collectionsCount (Number)
- totalDocuments (Number)
- documentCounts (Map)
- documentCounts.$* (Number)
- collectionsList (Array)
- status (String; COMPLETED, FAILED, VALIDATED, RESTORED)
- createdBy (ref User)
- createdByName (String)
- notes (String)

### Category

- name (String)
- type (String; INCOME, EXPENSE, TRANSFER)
- expenseClassification (String; GENERAL_EXPENSE, PROPERTY_OWN_EXPENSE, UNIT_EXPENSE)
- propertyId (ref Property)
- unitId (ObjectId)
- parentCategoryId (ref Category)
- isMainHead (Boolean)
- isRentalHead (Boolean)
- excludeFromReports (Boolean)

### CommunicationAttachment

- conversationId (String)
- sender (ref User)
- publicId (String)
- resourceType (String; image, video)
- deliveryType (String; authenticated)
- format (String)
- originalName (String)
- mimeType (String)
- size (Number)

### CommunicationCall

- conversationId (String)
- caller (ref User)
- callee (ref User)
- type (String; AUDIO, VIDEO)
- status (String; RINGING, ACCEPTED, DECLINED, CANCELLED, ENDED, MISSED)
- active (Boolean)
- startedAt (Date)
- endedAt (Date)
- durationSeconds (Number)

### CommunicationMessage

- conversationId (String)
- sender (ref User)
- recipient (ref User)
- clientMessageId (String)
- type (String; TEXT, IMAGE, VOICE)
- text (String)
- attachment (ref CommunicationAttachment)
- deliveredAt (Date)
- readAt (Date)

### CommunicationRateLimit

- key (String)
- count (Number)
- resetAt (Date)

### Employee

- name (String)
- fatherOrHusbandName (String)
- employeeCode (String)
- cnic (String)
- mobileNumber (String)
- email (String)
- address (String)
- dateOfBirth (Date)
- designation (String)
- department (String)
- staffLocation (String)
- shiftOpeningTime (String)
- employmentType (String; FULL_TIME, PART_TIME, CONTRACT, INTERN)
- joiningDate (Date)
- employmentStatus (String; ACTIVE, INACTIVE, PROBATION, TERMINATED)
- profilePhotoUrl (String)
- reportingManager (String)
- basicSalary (Number)
- allowance (Number)
- allowanceReason (String)
- fuelAllowanceEnabled (Boolean)
- fuelAllowance (Number)
- foodAllowance (Number)
- mobileAllowance (Number)
- transportAllowance (Number)
- performanceAllowance (Number)
- otherAllowances (Number)
- allowancesList.name (String)
- allowancesList.amount (Number)
- allowancesList.isActive (Boolean)
- allowedMonthlyLeaves (Number)
- accountTitle (String)
- ibanNumber (String)
- bankName (String)
- branchName (String)
- accountNumber (String)
- paymentMethod (String; BANK_TRANSFER, CASH, CHEQUE)
- loanBalance (Number)
- isActive (Boolean)
- isExcludedFromSalary (Boolean)
- notes (String)
- createdBy (ref User)

### MonthlyReport

- month (String)
- year (Number)
- monthNumber (Number)
- status (String; DRAFT, REVIEWED, PUBLISHED)
- reconciliationStatus (String; RECONCILED, DISCREPANCY, PENDING)
- reconciliationNotes (String)
- summarySnapshot.totalRentalIncome (Number)
- summarySnapshot.totalOtherIncome (Number)
- summarySnapshot.totalIncome (Number)
- summarySnapshot.totalExpenses (Number)
- summarySnapshot.totalTransfers (Number)
- summarySnapshot.openingBalance (Number)
- summarySnapshot.closingBalance (Number)
- summarySnapshot.netPosition (Number)
- summarySnapshot.totalBankClosing (Number)
- summarySnapshot.totalCashClosing (Number)
- preparedBy (ref User)
- preparedByName (String)
- reviewedBy (ref User)
- reviewedByName (String)
- reviewedAt (Date)
- publishedBy (ref User)
- publishedByName (String)
- publishedAt (Date)
- generatedAt (Date)
- notes (String)

### OtherIncome

- receiptNumber (String)
- receiptDate (Date)
- incomeHeadId (ref OtherIncomeHead)
- headName (String)
- category (String)
- amount (Number)
- receivingAccountId (ref Account)
- propertyId (ref Property)
- unitId (ObjectId)
- receivedFrom (String)
- referenceNumber (String)
- attachments.url (String)
- attachments.publicId (String)
- attachments.originalName (String)
- attachments.mimeType (String)
- attachments.size (Number)
- transactionDetail (String)
- description (String)
- status (String; POSTED, DRAFT, VOID, REVERSED)
- voucherId (ref Voucher)
- voucherNo (String)
- transactionId (ref Transaction)
- checkedBy (String)
- reversalReason (String)
- reversedAt (Date)
- reversedBy (ref User)
- createdBy (ref User)
- updatedBy (ref User)

### OtherIncomeHead

- name (String)
- code (String)
- description (String)
- isActive (Boolean)
- createdBy (ref User)
- updatedBy (ref User)

### Payroll

- payrollMonth (String)
- employeeId (ref Employee)
- employeeName (String)
- designation (String)
- department (String)
- basicSalary (Number)
- allowance (Number)
- allowanceReason (String)
- fuelAllowance (Number)
- foodAllowance (Number)
- mobileAllowance (Number)
- performanceAllowance (Number)
- otherAllowances (Number)
- grossSalary (Number)
- totalDays (Number)
- presentDays (Number)
- lateDays (Number)
- leaveDays (Number)
- lopDays (Number)
- lopDeduction (Number)
- loanDeduction (Number)
- otherDeduction (Number)
- totalDeduction (Number)
- netPayable (Number)
- accountTitle (String)
- ibanNumber (String)
- bankName (String)
- status (String; DRAFT, FINALIZED, PAID)
- paymentStatus (String; DRAFT, CALCULATED, APPROVED, PENDING_PAYMENT, PARTIAL_PAYMENT, PAID)
- paidFromAccountId (ref Account)
- paidFromAccountName (String)
- paymentDate (Date)
- transactionId (ref Transaction)
- voucherId (ref Voucher)
- voucherNo (String)
- paymentMethod (String; BANK_TRANSFER, CASH, CHEQUE)
- paymentNotes (String)
- paidDate (Date)
- notes (String)
- salaryInstallments.amount (Number)
- salaryInstallments.paymentDate (Date)
- salaryInstallments.disbursementMonth (String)
- salaryInstallments.paidFromAccountId (ref Account)
- salaryInstallments.paidFromAccountName (String)
- salaryInstallments.paymentMethod (String; BANK_TRANSFER, CASH, CHEQUE)
- salaryInstallments.voucherNo (String)
- salaryInstallments.transactionId (ref Transaction)
- salaryInstallments.notes (String)
- salaryInstallments.paidBy (String)
- totalInstallmentsPaid (Number)

### PendingEntry

- entryType (String; RENT, EXPENSE, TRANSFER, SALARY, OTHER_INCOME)
- expenseClassification (String; GENERAL_EXPENSE, PROPERTY_OWN_EXPENSE, UNIT_EXPENSE)
- attachments.url (String)
- attachments.publicId (String)
- attachments.originalName (String)
- attachments.mimeType (String)
- attachments.size (Number)
- status (String; PENDING_VERIFICATION, VERIFIED, REJECTED, EDITED)
- verificationInProgress (Boolean)
- verificationStartedAt (Date)
- submittedBy (ref User)
- submittedByName (String)
- submittedAt (Date)
- amount (Number)
- voucherNo (String)
- date (Date)
- rentMonth (String)
- propertyId (ref Property)
- unitId (ObjectId)
- tenantId (ref Tenant)
- agreementId (ref RentalAgreement)
- categoryId (ref Category)
- drAccountId (ref Account)
- crAccountId (ref Account)
- receivingAccountId (ref Account)
- detail (String)
- paymentMethod (String)
- referenceNumber (String)
- entryData (Mixed)
- verifiedBy (ref User)
- verifiedByName (String)
- verifiedAt (Date)
- rejectedBy (ref User)
- rejectedByName (String)
- rejectedAt (Date)
- rejectionReason (String)
- isEdited (Boolean)
- editedBy (ref User)
- editedByName (String)
- editedAt (Date)
- postedTransactionId (ref Transaction)
- postedRentReceivedId (ref RentReceived)
- auditLog.action (String)
- auditLog.performedBy (String)
- auditLog.performedById (ref User)
- auditLog.timestamp (Date)
- auditLog.notes (String)
- auditLog.changes (Mixed)

### Property

- propertyName (String)
- plazaName (String)
- propertyCode (String)
- propertyType (String; PLAZA, HOUSE, BUILDING, SHOPS, OTHER)
- address (String)
- city (String)
- area (String)
- description (String)
- status (String; ACTIVE, INACTIVE)
- notes (String)
- isActive (Boolean)
- createdBy (ref User)
- updatedBy (ref User)
- units.unitName (String)
- units.unitNumber (String)
- units.unitType (String; SHOP, OFFICE, HOUSE, APARTMENT, FLAT, OTHER)
- units.floor (String)
- units.area (Number)
- units.areaUnit (String; SQ_FT, MARLA, KANAL)
- units.status (String; OCCUPIED, VACANT, MAINTENANCE, INACTIVE)
- units.description (String)
- units.notes (String)
- units.isActive (Boolean)
- units.createdBy (ref User)
- units.updatedBy (ref User)
- units.tenantName (String)
- units.dueDay (Number)
- units.agreedRent (Number)
- units.renewalDate (Date)
- units.julyReceivable (Number)
- units.defaultReceivingAccountId (ref Account)

### RentalAgreement

- agreementNumber (String)
- tenantId (ref Tenant)
- propertyId (ref Property)
- unitId (ObjectId)
- startDate (Date)
- endDate (Date)
- renewalDate (Date)
- dueDay (Number)
- monthlyRent (Number)
- previousRent (Number)
- securityDeposit (Number)
- rentIncreaseAmount (Number)
- rentIncreasePercentage (Number)
- paymentFrequency (String; MONTHLY, QUARTERLY, BI_ANNUAL, ANNUAL)
- status (String; DRAFT, ACTIVE, EXPIRED, TERMINATED, RENEWED, INACTIVE)
- notes (String)
- createdBy (ref User)
- updatedBy (ref User)

### RentDue

- agreementId (ref RentalAgreement)
- tenantId (ref Tenant)
- propertyId (ref Property)
- unitId (ObjectId)
- rentMonth (String)
- dueDate (Date)
- expectedRentAmount (Number)
- paidAmount (Number)
- remainingAmount (Number)
- status (String; DUE, PARTIAL, PAID, OVERDUE, CANCELLED)
- notes (String)
- createdBy (ref User)
- updatedBy (ref User)

### RentReceived

- receiptNumber (String)
- receiptDate (Date)
- tenantId (ref Tenant)
- propertyId (ref Property)
- unitId (ObjectId)
- agreementId (ref RentalAgreement)
- rentDueId (ref RentDue)
- rentMonth (String)
- amount (Number)
- allocatedCurrentMonth (Number)
- allocatedPreviousReceivable (Number)
- allocatedAdvance (Number)
- previousReceivableBalance (Number)
- remainingReceivable (Number)
- receivingAccountId (ref Account)
- paymentMethod (String; BANK_TRANSFER, CASH, CHEQUE, OTHER)
- referenceNumber (String)
- attachments.url (String)
- attachments.publicId (String)
- attachments.originalName (String)
- attachments.mimeType (String)
- attachments.size (Number)
- description (String)
- status (String; RECEIVED, VERIFIED, REVERSED)
- transactionId (ref Transaction)
- checkedBy (String)
- checkedAt (Date)
- createdBy (ref User)
- updatedBy (ref User)

### StaffAuditLog

- userId (ref User)
- userName (String)
- action (String)
- recordId (String)
- details (String)
- oldValue (Mixed)
- newValue (Mixed)

### StaffDesignation

- name (String)
- department (String)
- description (String)
- isActive (Boolean)

### StaffLeave

- employeeId (ref Employee)
- startDate (Date)
- endDate (Date)
- days (Number)
- leaveType (String; CASUAL, SICK, ANNUAL, OTHER)
- reason (String)
- status (String; PENDING, APPROVED, REJECTED)
- approvedBy (ref User)

### StaffLoan

- employeeId (ref Employee)
- date (Date)
- type (String; DISBURSEMENT, REPAYMENT)
- amount (Number)
- previousBalance (Number)
- newBalance (Number)
- payrollMonth (String)
- description (String)
- createdBy (ref User)

### StaffLocation

- name (String)
- code (String)
- openingTime (String)
- gracePeriodMinutes (Number)
- description (String)
- isActive (Boolean)

### StaffSetting

- companyName (String)
- defaultShiftOpeningTime (String)
- defaultGracePeriodMinutes (Number)
- salaryCalculationBasis (String; FIXED_30_DAYS, CALENDAR_DAYS, WORKING_DAYS)
- defaultAllowedLeaves (Number)
- whtRate (Number)

### SystemUpdate

- version (String)
- buildId (String)
- updateType (String; NORMAL, CRITICAL)
- title (String)
- description (Array)
- criticalDeadline (Date)
- minSupportedVersion (String)
- active (Boolean)
- publishedBy (ref User)
- publishedByName (String)

### Tenant

- fullName (String)
- email (String)
- phone (String)
- alternatePhone (String)
- address (String)
- city (String)
- country (String)
- identificationNumber (String)
- companyName (String)
- notes (String)
- status (String; ACTIVE, INACTIVE)
- isActive (Boolean)
- createdBy (ref User)
- updatedBy (ref User)

### Transaction

- date (Date)
- voucherNo (String)
- voucherId (ref Voucher)
- detail (String)
- transactionType (String; OPENING_BALANCE, TRANSFER, INCOME, EXPENSE, ADJUSTMENT)
- expenseClassification (String; GENERAL_EXPENSE, PROPERTY_OWN_EXPENSE, UNIT_EXPENSE)
- attachments.url (String)
- attachments.publicId (String)
- attachments.originalName (String)
- attachments.mimeType (String)
- attachments.size (Number)
- categoryId (ref Category)
- drAccountId (ref Account)
- crAccountId (ref Account)
- amount (Number)
- propertyId (ref Property)
- unitId (ObjectId)
- tenantId (ref Tenant)
- agreementId (ref RentalAgreement)
- reference (String)
- rentMonth (String)
- reportCategory (String; Payments, Rent, Other Income, Transfer, Opening Balance, Owner Personal)
- sourceModule (String; RENT_RECEIVED, EXPENSE, TRANSFER, OTHER_INCOME, OTHER_PAYMENT, OPENING_BALANCE, MANUAL_VOUCHER, OWNER_PERSONAL)
- sourceId (ObjectId)
- status (String; PENDING, VERIFIED, POSTED, REVERSED, VOID)
- checkedBy (String)
- createdBy (ref User)
- updatedBy (ref User)

### User

- name (String)
- email (String)
- password (String)
- role (String; ADMIN, DATA_ENTRY, ADMIN_PUBLISHER, VERIFIER, VERIFICATION_MANAGER)
- isActive (Boolean)
- lastLoginAt (Date)
- lastLogoutAt (Date)
- lastActiveAt (Date)
- loginCount (Number)
- tokenVersion (Number)
- mustChangePassword (Boolean)
- isDeleted (Boolean)
- deletedAt (Date)
- deletedBy (ref User)
- deletedByName (String)

### Voucher

- voucherNumber (String)
- voucherDate (Date)
- voucherType (String; RENT_RECEIPT, EXPENSE, TRANSFER, OTHER_INCOME, OTHER_PAYMENT, ADJUSTMENT, OPENING_BALANCE)
- reference (String)
- description (String)
- status (String; POSTED, DRAFT, REVERSED, VOID, VERIFIED, PENDING)
- totalAmount (Number)
- totalDebit (Number)
- totalCredit (Number)
- isBalanced (Boolean)
- linesCount (Number)
- sourceModule (String; RENT_RECEIVED, EXPENSE, TRANSFER, OTHER_INCOME, OTHER_PAYMENT, OPENING_BALANCE, MANUAL_VOUCHER, OWNER_PERSONAL)
- sourceId (ObjectId)
- checkedBy (String)
- createdBy (ref User)
- updatedBy (ref User)

