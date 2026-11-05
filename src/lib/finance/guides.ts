export type FinanceCitation = {
  doc: "RSO Manual 26-27";
  page: number;
  section: string;
};

export type FinanceGuideStep = {
  key: string;
  title: string;
  detail: string;
  why: string;
  citation: FinanceCitation | null;
};

export type FinanceGuide = {
  key: string;
  title: string;
  summary: string;
  steps: FinanceGuideStep[];
};

const cite = (page: number, section: string): FinanceCitation => ({
  doc: "RSO Manual 26-27",
  page,
  section,
});

export const FINANCE_GUIDES: FinanceGuide[] = [
  {
    key: "bank_account",
    title: "Open an organization bank account",
    summary: "Prepare the required signatories and paperwork before visiting China Bank.",
    steps: [
      {
        key: "prepare",
        title: "Prepare the signatory resolution",
        detail: "Write a resolution endorsing exactly three authorized signatories: two students and the Faculty Adviser. Apply the official school seal.",
        why: "The manual specifies the account's three-signatory arrangement and sealed resolution.",
        citation: cite(29, "D. Opening of Organizational Bank Account"),
      },
      {
        key: "documents",
        title: "Collect each signatory's documents",
        detail: "Gather two valid IDs for each signatory and a Barangay Certificate of Indigency marked “For Bank Purposes.”",
        why: "These are listed among the required bank-account documents.",
        citation: cite(29, "D. Opening of Organizational Bank Account"),
      },
      {
        key: "endorsement",
        title: "Get the SDAO endorsement",
        detail: "Submit the sealed resolution and supporting documents to SDAO for endorsement before going to the bank.",
        why: "SDAO endorsement is a required document for opening the account.",
        citation: cite(29, "D. Opening of Organizational Bank Account"),
      },
      {
        key: "deposit",
        title: "Coordinate the visit and initial deposit",
        detail: "Confirm the requirements are complete, prepare the ₱5,000 initial deposit, and make sure all three signatories can attend in person.",
        why: "The manual requires the initial deposit and all three signatories to be present.",
        citation: cite(29, "D. Opening of Organizational Bank Account"),
      },
      {
        key: "bank_visit",
        title: "Complete the bank forms",
        detail: "Submit the documents, complete bank forms, sign specimen signatures, present original IDs, and get an acknowledgment or receipt.",
        why: "The manual lists the in-branch steps and asks the organization to obtain account/passbook details and ask about activation.",
        citation: cite(29, "C. Bank Provider; D. Opening of Organizational Bank Account"),
      },
      {
        key: "file",
        title: "Send account details to SDAO",
        detail: "After opening, submit a copy of the sealed resolution and the account number and relevant account details to SDAO.",
        why: "The manual requires post-opening submission to SDAO.",
        citation: cite(29, "D. Opening of Organizational Bank Account"),
      },
    ],
  },
  {
    key: "change_signatories",
    title: "Change bank signatories",
    summary: "Keep bank records aligned with the organization's current officers.",
    steps: [
      {
        key: "resolution",
        title: "Draft the signatory-change resolution",
        detail: "Prepare a resolution and clearly identify outgoing and incoming signatories.",
        why: "The manual lists both items as required parts of a signatory change.",
        citation: cite(30, "E. Changing Bank Signatories"),
      },
      {
        key: "endorsement",
        title: "Obtain SDAO endorsement",
        detail: "Get the SDAO seal or endorsement and complete the requirements for the incoming signatories.",
        why: "SDAO endorsement and new-signatory requirements are listed in the prescribed process.",
        citation: cite(30, "E. Changing Bank Signatories"),
      },
      {
        key: "transfer",
        title: "Coordinate the bank transfer",
        detail: "Arrange for outgoing and incoming signatories to be present during the account transfer, then complete the bank's requirements.",
        why: "The manual says both sets of signatories must be present and the bank requirements completed.",
        citation: cite(30, "E. Changing Bank Signatories"),
      },
      {
        key: "report",
        title: "Submit the change and report it",
        detail: "Submit the requirements to the bank for approval, and document and report the change to SDAO.",
        why: "Changes must be documented and reported to SDAO.",
        citation: cite(30, "E. Changing Bank Signatories"),
      },
    ],
  },
  {
    key: "budget_proposal",
    title: "Prepare a budget proposal and fee breakdown",
    summary: "Make every proposed cost and participant fee easy to explain.",
    steps: [
      {
        key: "budget",
        title: "List proposed costs and funding sources",
        detail: "Prepare the event budget with each expense, its purpose, funding source, and any participant fee.",
        why: "SDAO may review the purpose, expenses, funding sources, participant fees, quantities, and pricing.",
        citation: cite(20, "D. Activity Budget"),
      },
      {
        key: "breakdown",
        title: "Explain each charged fee",
        detail: "If participants will pay a registration or activity fee, give a clear, detailed breakdown of the amount and the expenses it covers.",
        why: "The manual explicitly requires a fee breakdown when students are charged.",
        citation: cite(21, "D. Activity Budget"),
      },
      {
        key: "support",
        title: "Keep supporting documents ready",
        detail: "Be ready to answer questions and provide complete, accurate explanations and supporting documents for questioned items.",
        why: "The organization is responsible for responding to SDAO's clarifications.",
        citation: cite(21, "D. Activity Budget"),
      },
    ],
  },
  {
    key: "liquidation",
    title: "Prepare an event liquidation",
    summary: "Keep the post-activity report and supporting financial records together.",
    steps: [
      {
        key: "records",
        title: "Gather transaction records",
        detail: "Collect the receipts and supporting financial documents for the event's collections and expenses.",
        why: "The liquidation report must include supporting financial documents and follow SCOA procedures.",
        citation: cite(21, "E. Post-Activity Report"),
      },
      {
        key: "report",
        title: "Complete the post-activity report",
        detail: "Document the activity's implementation, outcomes, challenges, participant information, evaluation, and financial accountability.",
        why: "These are the minimum topics described for the Post-Activity Report.",
        citation: cite(21, "E. Post-Activity Report"),
      },
      {
        key: "liquidation_report",
        title: "Include the liquidation report",
        detail: "Include the liquidation report and supporting financial documents, following the applicable SCOA policies and procedures.",
        why: "The manual includes liquidation and its supporting records as part of the post-activity requirements.",
        citation: cite(21, "E. Post-Activity Report"),
      },
      {
        key: "submit",
        title: "Submit the PAR within five days",
        detail: "Submit the required Post-Activity Report within five days after the approved activity, with the liquidation report included.",
        why: "The manual sets a five-day deadline for the PAR and lists the liquidation report among its minimum contents.",
        citation: cite(21, "E. Post-Activity Report"),
      },
    ],
  },
  {
    key: "fundraising_approval",
    title: "Get fundraising approval",
    summary: "Obtain approval before collecting or generating income.",
    steps: [
      {
        key: "approval",
        title: "Get prior approval",
        detail: "Secure SDAO and other appropriate office approval before fundraising, soliciting, collecting, or running an income-generating activity.",
        why: "The manual requires prior approval for fundraising activities.",
        citation: cite(26, "A. Fundraising"),
      },
      {
        key: "purpose",
        title: "Document the purpose and beneficiary",
        detail: "State the legitimate organizational purpose, identify who benefits or how the funds will be used, and prepare an approved activity and budget proposal.",
        why: "These are required elements of an approved fundraising activity.",
        citation: cite(26, "A. Fundraising"),
      },
      {
        key: "collection",
        title: "Use approved collection procedures",
        detail: "Follow the prescribed collection and handling procedures and keep complete financial records and documentation for every transaction.",
        why: "The manual requires proper collection, handling, and transaction records.",
        citation: cite(26, "A. Fundraising"),
      },
      {
        key: "liquidate",
        title: "Submit reports and liquidation",
        detail: "Submit the required liquidation and financial reports within the prescribed period.",
        why: "Fundraising income remains subject to the organization's reporting and liquidation requirements.",
        citation: cite(26, "A. Fundraising"),
      },
    ],
  },
  {
    key: "merchandise_proposal",
    title: "Submit a merchandise proposal",
    summary: "Get the proposal reviewed before production, distribution, or sale.",
    steps: [
      {
        key: "proposal",
        title: "Write the proposal or resolution",
        detail: "Prepare a formal proposal letter or organizational resolution for SDAO review and approval before producing, distributing, or selling merchandise.",
        why: "The manual specifies both the review step and acceptable proposal forms.",
        citation: cite(27, "B. Merchandise"),
      },
      {
        key: "details",
        title: "Describe the product and purpose",
        detail: "Explain the organizational purpose, product type, and proposed design, including applicable organizational and University branding standards.",
        why: "These are among the minimum proposal details listed in the manual.",
        citation: cite(27, "B. Merchandise"),
      },
      {
        key: "approval",
        title: "Wait for approval before proceeding",
        detail: "Submit the complete proposal for review and approval before production, distribution, or sale.",
        why: "The manual requires approval before any merchandise activity.",
        citation: cite(27, "B. Merchandise"),
      },
    ],
  },
  {
    key: "scoa_audit",
    title: "Prepare for a SCOA audit",
    summary: "Keep the ledger, receipts, reconciliations, and obligations ready for review.",
    steps: [
      {
        key: "schedule",
        title: "Plan for the per-term audit",
        detail: "Expect a SCOA-led financial audit each term and keep records current throughout the term.",
        why: "The manual makes RSOs subject to a per-term financial audit.",
        citation: cite(30, "F. Financial Audit"),
      },
      {
        key: "documents",
        title: "Organize receipts and vouchers",
        detail: "Make sure every transaction is recorded and supported by complete documentation, including receipts, vouchers, and other required records.",
        why: "SCOA reviews supporting documentation during the audit.",
        citation: cite(30, "F. Financial Audit"),
      },
      {
        key: "reconcile",
        title: "Reconcile account balances",
        detail: "Compare bank balances with the organization's financial records and supporting documents.",
        why: "The audit checks whether bank balances are properly reconciled.",
        citation: cite(30, "F. Financial Audit"),
      },
      {
        key: "obligations",
        title: "List open obligations and discrepancies",
        detail: "Identify outstanding obligations, liabilities, commitments, and any financial discrepancies that need clarification or correction.",
        why: "The audit reviews obligations and may require clarification or corrective action.",
        citation: cite(30, "F. Financial Audit"),
      },
    ],
  },
  {
    key: "annual_turnover",
    title: "Complete annual financial turnover",
    summary: "Hand over records, funds, accounts, property, and pending matters to incoming officers.",
    steps: [
      {
        key: "records",
        title: "Hand over financial records and funds",
        detail: "Transfer financial records, the passbook when applicable, organizational funds, and financial assets.",
        why: "The annual turnover list explicitly includes these items.",
        citation: cite(37, "A. Annual Turnover"),
      },
      {
        key: "assets",
        title: "Transfer activity and inventory records",
        detail: "Include activity and project files, equipment, merchandise and inventory records, official accounts, and organizational documents.",
        why: "The manual defines turnover broadly across records, assets, and accounts.",
        citation: cite(37, "A. Annual Turnover"),
      },
      {
        key: "pending",
        title: "Review pending commitments",
        detail: "List pending transactions, obligations, commitments, contracts, partnerships, and other matters that incoming officers must continue.",
        why: "Pending transactions and agreements are part of the required turnover.",
        citation: cite(37, "A. Annual Turnover"),
      },
      {
        key: "certificate",
        title: "Sign the turnover certificate",
        detail: "Prepare a Turnover Certificate and have it signed by the outgoing and incoming presidents, treasurer, auditor, adviser, and any other required parties.",
        why: "The manual uses the certificate to document completed turnover and names the required signatories.",
        citation: cite(38, "B. Turnover Certification"),
      },
    ],
  },
  {
    key: "nonrenewal_turnover",
    title: "Turn over finances after non-renewal",
    summary: "Securely account for remaining funds and records and transfer custody to SDAO.",
    steps: [
      {
        key: "deadline",
        title: "Start the turnover within five working days",
        detail: "After official notice of non-renewal, prepare the financial turnover for submission to SDAO within five working days.",
        why: "The manual sets this deadline for RSOs with and without bank accounts.",
        citation: cite(31, "Financial Turnover Upon Non-Renewal"),
      },
      {
        key: "documents",
        title: "Gather the passbook and financial documents",
        detail: "For an existing account, provide the original passbook and latest transaction page, documents for outstanding obligations, and the non-renewal resolution.",
        why: "These documents are listed for RSOs with bank or online accounts.",
        citation: cite(31, "Financial Turnover Upon Non-Renewal"),
      },
      {
        key: "funds",
        title: "Account for and surrender remaining funds",
        detail: "Restrict further withdrawals except those authorized for turnover, liquidation, or settling obligations; account for the remaining balance and surrender it to SDAO.",
        why: "The manual requires restricted account activity and SDAO custodianship.",
        citation: cite(31, "Financial Turnover Upon Non-Renewal"),
      },
      {
        key: "endorsement",
        title: "Document the funds handover",
        detail: "Prepare a Letter of Endorsement recording the amount turned over, outgoing officers' and adviser's signatures, SCOA-signed financial records, and oversight acknowledgment.",
        why: "The manual lists these as contents of the financial turnover endorsement.",
        citation: cite(31, "Financial Turnover Upon Non-Renewal"),
      },
      {
        key: "custody",
        title: "Confirm SDAO custody and trust records",
        detail: "Record the exact amount and purpose of funds held in trust and keep the separate trust-funds ledger entry and oversight report.",
        why: "The manual describes SDAO custody, transfer to the Student Government account, and a separate ledger entry.",
        citation: cite(32, "C. Custodianship of Non-Renewed RSO Funds"),
      },
    ],
  },
];

export const FINANCE_GUIDES_BY_KEY = Object.fromEntries(FINANCE_GUIDES.map((guide) => [guide.key, guide])) as Record<string, FinanceGuide>;
