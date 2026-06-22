const HR_WARNING =
  "This tool supports HR document analysis and administrative review. It does not provide legal advice or make final employment decisions. Important results must be reviewed by authorized HR and legal professionals.";
const AI_RECOMMENDATION_LABEL = "AI recommendations \u2014 these suggestions are not stated in the uploaded documents.";
let runtimeGeminiApiKey = sessionStorage.getItem("peoplemind_gemini_key") || "";
let activeGeminiTestId = 0;

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_MODEL_STORAGE_KEY = "peoplemind_gemini_model";
const GEMINI_API_STATUS_LABELS = {
  no_key: "API Key Required",
  testing: "Testing...",
  connected: "Connected",
  invalid_key: "Invalid Key",
  permission_denied: "Permission Denied",
  quota_exceeded: "Quota Exceeded",
  invalid_model: "Model Error",
  network_error: "Offline",
  service_unavailable: "Gemini Unavailable",
};
const GEMINI_API_PANEL_LABELS = {
  no_key: "API key required",
  testing: "Testing Gemini connection",
  connected: "Gemini connected",
  invalid_key: "The Gemini API key was not accepted",
  permission_denied: "This key does not have Gemini permission",
  quota_exceeded: "Gemini quota or rate limit exceeded",
  invalid_model: "Selected Gemini model or request is not valid",
  network_error: "Network connection failed",
  service_unavailable: "Gemini service unavailable",
};

const STRONG_MATCH_THRESHOLD = 34;
const protectedTerms = new Set(["ns", "s", "vs", "na", "hr", "cv", "jd", "kpi", "id", "it"]);
const queryExpansionMap = {
  chart: ["table", "form", "assessment", "evaluation", "rating", "scorecard"],
  charts: ["table", "form", "assessment", "evaluation", "rating", "scorecard"],
  evaluating: ["assessment", "rating", "scoring", "review"],
  evaluate: ["assessment", "rating", "scoring", "review"],
  evaluation: ["assessment", "rating", "scoring", "review"],
  person: ["candidate", "applicant", "employee", "interviewee"],
  people: ["candidate", "applicant", "employee", "interviewee"],
  applicant: ["candidate", "person", "interviewee"],
  candidate: ["applicant", "person", "interviewee"],
  score: ["rating", "assessment", "evaluation", "scorecard"],
  scoring: ["rating", "assessment", "evaluation", "scorecard"],
  form: ["document", "template", "assessment", "questionnaire"],
};
const ratingExpansionTerms = [
  "rating key",
  "assessment form",
  "interview assessment",
  "evaluation table",
  "rating table",
  "candidate evaluation",
  "scoring form",
  "interview score",
  "satisfactory",
  "not satisfactory",
  "very satisfactory",
  "not applicable",
  "criteria",
  "comments",
];
const assessmentImprovementIdeas = [
  "Use a clearly defined 1-5 scoring scale.",
  "Add observable examples for every rating.",
  "Include role-specific skills and competencies.",
  "Require evidence or comments for each score.",
  "Add weighted scoring and an overall result.",
  "Include strengths, concerns, and follow-up questions.",
  "Add interviewer sign-off and a fair-review checklist.",
  "Require human HR review before any final employment decision.",
];

const suggestedQuestionPrompts = [
  "Summarize the currently selected document.",
  "What is the purpose of this document?",
  "What are the main responsibilities mentioned?",
  "What approval steps are required?",
  "What documents or forms are required?",
  "What deadlines or time limits are mentioned?",
  "What training is mandatory?",
  "What employee benefits are described?",
  "What leave rules are mentioned?",
  "What probation rules are mentioned?",
  "What working-hour rules are mentioned?",
  "What remote-work rules are mentioned?",
  "What conduct rules are mentioned?",
  "What disciplinary steps are mentioned?",
  "What grievance steps are mentioned?",
  "What privacy or data-protection rules are mentioned?",
  "What information is missing from this document?",
  "What parts of this document may confuse employees?",
  "What should be improved in this document?",
  "Suggest a better structure for this document.",
  "Create an employee FAQ from this document.",
  "Create a manager checklist from this document.",
  "Create an HR review checklist from this document.",
  "Create onboarding steps from this document.",
  "Create interview questions from this document.",
  "Extract candidate skills from the selected document.",
  "Compare the selected CV with the selected job description.",
  "Identify supported candidate experience only from the uploaded document.",
  "Identify missing required information in the candidate document.",
  "Generate recruitment notes for an HR reviewer.",
  "Extract job requirements from the selected job description.",
  "What skills are required for this role?",
  "What certifications are required?",
  "What learning objectives are mentioned?",
  "Generate knowledge-check questions from this training material.",
  "Create an employee learning plan from this material.",
  "Find contradictions across uploaded documents.",
  "Compare these uploaded policies.",
  "What policies were added or changed?",
  "What responsibilities changed between documents?",
  "Find duplicate rules across documents.",
  "Find areas requiring HR review.",
  "Extract compliance requirements.",
  "Identify policy gaps.",
  "Detect conflicting procedures.",
  "Identify missing approval steps.",
  "Generate review questions for HR.",
  "Give AI recommendations to improve this document.",
  "Find risks and unclear wording in this document.",
  "Create a short executive summary for managers.",
];

const workflowTemplate = [
  { id: "readRequest", number: 1, label: "Read Request", detail: "Capture the current HR question" },
  { id: "classifyIntent", number: 2, label: "Classify Intent", detail: "Detect the HR task and recommendation needs" },
  { id: "searchScope", number: 3, label: "Set Search Scope", detail: "Use every ready uploaded document" },
  { id: "detectTarget", number: 4, label: "Detect Target Document", detail: "Find a named document when the question includes one" },
  { id: "searchDocs", number: 5, label: "Search All Ready Documents", detail: "Scan searchable sections from the active session" },
  { id: "rankEvidence", number: 6, label: "Rank Evidence", detail: "Select the strongest document passages" },
  { id: "buildContext", number: 7, label: "Build Grounded Context", detail: "Prepare source-limited evidence for AI or fallback" },
  { id: "consultGemini", number: 8, label: "Consult Gemini", detail: "Generate a grounded answer when a key is available" },
  { id: "validateCitations", number: 9, label: "Validate Citations", detail: "Reject stale or unsupported references" },
  { id: "finalAnswer", number: 10, label: "Generate Final Answer", detail: "Attach verified View Reference actions" },
];

const workflowAliasMap = {
  question: "readRequest",
  scope: "searchScope",
  target: "detectTarget",
  retrieve: "rankEvidence",
  model: "consultGemini",
  validate: "validateCitations",
  references: "finalAnswer",
};

const workflowStatusMap = {
  active: "running",
  done: "completed",
  warning: "warning",
  failed: "failed",
  skipped: "skipped",
  pending: "waiting",
};

const graphNodeTypes = [
  "HR Document",
  "Policy",
  "Policy Section",
  "Employee",
  "Manager",
  "HR Department",
  "Candidate",
  "Job Role",
  "Responsibility",
  "Benefit",
  "Leave Type",
  "Skill",
  "Certification",
  "Training Requirement",
  "Approval Process",
  "Disciplinary Procedure",
  "Grievance Procedure",
  "Compliance Requirement",
  "Workplace Risk",
  "Privacy Requirement",
  "Onboarding Task",
  "Reporting Channel",
  "Deadline",
  "Form",
  "Department",
];

const graphRelationshipTypes = [
  "Applies To",
  "Requires",
  "Approves",
  "Reports To",
  "Responsible For",
  "Includes",
  "Defines",
  "Provides",
  "Restricts",
  "Must Complete",
  "Must Report",
  "Escalates To",
  "Conflicts With",
  "Replaces",
  "References",
  "Depends On",
  "Reviewed By",
];

const deckThemes = {
  "PeopleMind Red": { accent: "#c51621", background: "#ffffff", text: "#111827", muted: "#64748b", footer: "#f8fafc" },
  "Executive Navy": { accent: "#1e3a8a", background: "#f8fafc", text: "#0f172a", muted: "#475569", footer: "#e2e8f0" },
  "Professional Teal": { accent: "#0f766e", background: "#ffffff", text: "#102a2a", muted: "#52706c", footer: "#d9fbf4" },
  "Minimal Light": { accent: "#334155", background: "#ffffff", text: "#111827", muted: "#64748b", footer: "#f1f5f9" },
  "Dark Corporate": { accent: "#38bdf8", background: "#0f172a", text: "#f8fafc", muted: "#cbd5e1", footer: "#111827" },
};

const graphScopeHelp = {
  "All Ready Documents": "Analyze every successfully processed HR document.",
  "Current Preview Document": "Generate a graph only from the document currently open in Workspace.",
  "Choose Specific Documents": "Select two or more documents to analyze together.",
  "Document Category": "Generate a graph from documents belonging to one HR category.",
  "Latest Edited Versions": "Use the newest edited version of each document when available.",
};

const graphCategoryOptions = [
  { label: "All Categories", matches: [] },
  { label: "Employee Policies", matches: ["Policies", "Employee Policies"] },
  { label: "Recruitment", matches: ["Recruitment"] },
  { label: "Onboarding", matches: ["Onboarding"] },
  { label: "Training", matches: ["Training"] },
  { label: "Benefits", matches: ["Benefits"] },
  { label: "Performance", matches: ["Performance"] },
  { label: "Compliance", matches: ["Compliance"] },
  { label: "Leave and Attendance", matches: ["Leave and Attendance", "Benefits", "Policies"] },
  { label: "Workplace Conduct", matches: ["Workplace Conduct", "Policies", "Compliance"] },
  { label: "General HR", matches: ["General HR"] },
];

const graphNodeGroupOptions = {
  "All Node Types": [],
  "People and Roles": ["Employee", "Manager", "HR Department", "Candidate", "Job Role", "Department"],
  Policies: ["HR Document", "Policy", "Policy Section", "Form"],
  Responsibilities: ["Responsibility", "Approval Process", "Reporting Channel", "Deadline"],
  Benefits: ["Benefit", "Leave Type"],
  Procedures: ["Disciplinary Procedure", "Grievance Procedure", "Approval Process", "Onboarding Task"],
  Training: ["Training Requirement", "Certification", "Skill"],
  Skills: ["Skill", "Certification", "Job Role"],
  Compliance: ["Compliance Requirement", "Privacy Requirement"],
  Risks: ["Workplace Risk", "Privacy Requirement"],
  Documents: ["HR Document", "Policy Section", "Form"],
};

const graphRelationshipFilterOptions = [
  "All Relationships",
  "Applies To",
  "Requires",
  "Approves",
  "Reports To",
  "Responsible For",
  "Includes",
  "Provides",
  "Conflicts With",
  "Replaces",
  "Reviewed By",
];

const graphGenerationStages = [
  "Preparing selected documents",
  "Extracting HR concepts",
  "Identifying relationships",
  "Validating source evidence",
  "Building graph",
  "Ready",
];

const modes = [
  {
    name: "Employee Policy Assistant",
    description: "Review employee-facing policies, benefits, responsibilities, leave, remote work, grievance, and disciplinary procedures.",
  },
  {
    name: "Recruitment Assistant",
    description: "Compare job descriptions and CVs as evidence-based decision support for authorized HR reviewers.",
  },
  {
    name: "Onboarding Assistant",
    description: "Turn onboarding documents into first-week plans, required document lists, systems notes, workplace rules, and new-hire FAQs.",
  },
  {
    name: "Training and Skills Assistant",
    description: "Extract learning objectives, required skills, certifications, checks, learning plans, and training reports.",
  },
  {
    name: "Policy Comparison",
    description: "Compare HR documents for added, removed, changed, duplicate, contradictory, and review-worthy policy details.",
  },
  {
    name: "HR Compliance Review",
    description: "Review policy content for stated requirements, gaps, conflicts, approval steps, checklists, and review questions.",
  },
  {
    name: "General HR Research",
    description: "Ask broad HR document questions with strict grounding in uploaded content and citations.",
  },
];

const state = {
  currentPage: "workspace",
  mode: modes[0].name,
  documents: [],
  chat: [],
  questionsAsked: 0,
  previewDocumentId: null,
  previewPageIndex: 0,
  previewSectionIndex: 0,
  zoom: 100,
  rotation: 0,
  searchStatus: "",
  renderToken: 0,
  activeReference: null,
  retrievalDebug: null,
  activeRequestId: null,
  activeRequestController: null,
  apiReplaceMode: false,
  apiConnectionStatus: runtimeGeminiApiKey ? "testing" : "no_key",
  geminiModel: sessionStorage.getItem(GEMINI_MODEL_STORAGE_KEY) || DEFAULT_GEMINI_MODEL,
  lastSuccessfulGeminiTest: null,
  lastFailedGeminiTest: null,
  lastGeminiHttpStatus: "Not tested",
  lastGeminiSafeMessage: runtimeGeminiApiKey ? "Saved key has not been tested in this page load." : "No API key saved.",
  lastGeminiSafeCode: "none",
  lastGeminiEndpoint: "",
  questionHighlight: null,
  currentEvidence: [],
  currentReferences: [],
  currentStructuredResponse: null,
  currentTargetDocumentId: null,
  currentIntent: null,
  currentProposedEdit: null,
  currentPrompt: "",
  currentGeminiRawResponse: "",
  currentValidation: null,
  currentRequestSnapshot: null,
  previousQuestion: "",
  previousAnswer: "",
  searchScope: "all",
  selectedSearchDocumentIds: [],
  workflow: createWorkflowState(),
  currentWorkflow: null,
  workflowHistory: [],
  currentGraph: createEmptyGraph(),
  graphSettings: {
    scope: "All Ready Documents",
    category: "All Categories",
    selectedDocumentIds: [],
    nodeType: "All Node Types",
    document: "All Documents",
    relationship: "All Relationships",
    minConfidence: 60,
    hideIsolated: false,
    showLabels: true,
    selectorOpen: false,
    documentSearch: "",
    chipsExpanded: false,
    showExample: false,
  },
  graphGeneration: {
    active: false,
    stage: "",
    stageIndex: -1,
  },
  selectedGraphItem: null,
  cytoscapeInstance: null,
  presentationDeck: createEmptyDeck(),
  presentationSettings: {
    title: "PeopleMind AI HR Analysis",
    type: "Executive Policy Brief",
    audience: "HR Leadership",
    scope: "All Ready Documents",
    slideCount: 7,
    tone: "Professional",
    theme: "PeopleMind Red",
    accentColor: "#c51621",
    companyName: "PeopleMind AI",
    logoText: "PM",
    footerText: "Evidence-based HR document intelligence",
    includeCitations: true,
    includeSpeakerNotes: true,
    includeRecommendations: true,
    includeActionPlan: true,
    includeGraphSlide: false,
    includeQuestionsSlide: true,
  },
  currentSlideIndex: 0,
  presentationHistory: [],
  metrics: {
    graphsGenerated: 0,
    decksGenerated: 0,
    slidesGenerated: 0,
    lastGraphGeneration: null,
    lastPresentationGeneration: null,
  },
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  hydrateSession();
  renderAll();
  wireEvents();
  refreshIcons();
});

function bindElements() {
  Object.assign(els, {
    fileInput: document.querySelector("#fileInput"),
    documentList: document.querySelector("#documentList"),
    totalDocsMetric: document.querySelector("#totalDocsMetric"),
    activeDocsMetric: document.querySelector("#activeDocsMetric"),
    questionsMetric: document.querySelector("#questionsMetric"),
    recentDocsList: document.querySelector("#recentDocsList"),
    activeCountBadge: document.querySelector("#activeCountBadge"),
    previewDocumentName: document.querySelector("#previewDocumentName"),
    previewMeta: document.querySelector("#previewMeta"),
    documentPreview: document.querySelector("#documentPreview"),
    pageInput: document.querySelector("#pageInput"),
    pageIndicator: document.querySelector("#pageIndicator"),
    prevPageButton: document.querySelector("#prevPageButton"),
    nextPageButton: document.querySelector("#nextPageButton"),
    zoomOutButton: document.querySelector("#zoomOutButton"),
    zoomInButton: document.querySelector("#zoomInButton"),
    resetZoomButton: document.querySelector("#resetZoomButton"),
    fitWidthButton: document.querySelector("#fitWidthButton"),
    rotateButton: document.querySelector("#rotateButton"),
    zoomIndicator: document.querySelector("#zoomIndicator"),
    viewerSearchInput: document.querySelector("#viewerSearchInput"),
    downloadDocumentButton: document.querySelector("#downloadDocumentButton"),
    fullscreenButton: document.querySelector("#fullscreenButton"),
    pageButtons: Array.from(document.querySelectorAll("[data-page-target]")),
    mobilePageSelect: document.querySelector("#mobilePageSelect"),
    workspacePage: document.querySelector("#workspacePage"),
    dashboardPage: document.querySelector("#dashboardPage"),
    workflowPage: document.querySelector("#workflowPage"),
    knowledgeGraphPage: document.querySelector("#knowledgeGraphPage"),
    presentationDeckPage: document.querySelector("#presentationDeckPage"),
    chatLog: document.querySelector("#chatLog"),
    questionForm: document.querySelector("#questionForm"),
    questionInput: document.querySelector("#questionInput"),
    questionHighlightLayer: document.querySelector("#questionHighlightLayer"),
    fileNameSuggestions: document.querySelector("#fileNameSuggestions"),
    searchScopeHint: document.querySelector("#searchScopeHint"),
    searchScopeSelect: document.querySelector("#searchScopeSelect"),
    selectedSearchDocumentsPanel: document.querySelector("#selectedSearchDocumentsPanel"),
    selectedSearchDocumentsList: document.querySelector("#selectedSearchDocumentsList"),
    askAboutFileButton: document.querySelector("#askAboutFileButton"),
    searchAllDocumentsButton: document.querySelector("#searchAllDocumentsButton"),
    workflowSummary: document.querySelector("#workflowSummary"),
    workflowList: document.querySelector("#workflowList"),
    workflowRequestId: document.querySelector("#workflowRequestId"),
    workflowQuestion: document.querySelector("#workflowQuestion"),
    workflowIntent: document.querySelector("#workflowIntent"),
    workflowSearchScope: document.querySelector("#workflowSearchScope"),
    workflowTargetDocument: document.querySelector("#workflowTargetDocument"),
    workflowDocsSearched: document.querySelector("#workflowDocsSearched"),
    workflowSectionsChecked: document.querySelector("#workflowSectionsChecked"),
    workflowEvidenceSelected: document.querySelector("#workflowEvidenceSelected"),
    workflowModel: document.querySelector("#workflowModel"),
    workflowCitationValidation: document.querySelector("#workflowCitationValidation"),
    workflowDuration: document.querySelector("#workflowDuration"),
    workflowStatusPill: document.querySelector("#workflowStatusPill"),
    workflowHistoryList: document.querySelector("#workflowHistoryList"),
    workflowHistoryCount: document.querySelector("#workflowHistoryCount"),
    workflowDetailPanel: document.querySelector("#workflowDetailPanel"),
    clearWorkflowHistoryButton: document.querySelector("#clearWorkflowHistoryButton"),
    exportWorkflowLogButton: document.querySelector("#exportWorkflowLogButton"),
    apiStatusButton: document.querySelector("#apiStatusButton"),
    apiStatusText: document.querySelector("#apiStatusText"),
    apiStatusDot: document.querySelector("#apiStatusDot"),
    apiKeyPanel: document.querySelector("#apiKeyPanel"),
    apiConnectionStatus: document.querySelector("#apiConnectionStatus"),
    apiConnectionDot: document.querySelector("#apiConnectionDot"),
    apiSavedMessage: document.querySelector("#apiSavedMessage"),
    apiConnectedActions: document.querySelector("#apiConnectedActions"),
    apiReplaceForm: document.querySelector("#apiReplaceForm"),
    apiInputLabel: document.querySelector("#apiInputLabel"),
    apiKeyFeedback: document.querySelector("#apiKeyFeedback"),
    geminiModelInput: document.querySelector("#geminiModelInput"),
    apiDiagnosticStatus: document.querySelector("#apiDiagnosticStatus"),
    apiDiagnosticModel: document.querySelector("#apiDiagnosticModel"),
    apiDiagnosticLastSuccess: document.querySelector("#apiDiagnosticLastSuccess"),
    apiDiagnosticLastFailure: document.querySelector("#apiDiagnosticLastFailure"),
    apiDiagnosticHttpStatus: document.querySelector("#apiDiagnosticHttpStatus"),
    apiDiagnosticSafeCode: document.querySelector("#apiDiagnosticSafeCode"),
    apiDiagnosticSafeMessage: document.querySelector("#apiDiagnosticSafeMessage"),
    apiDiagnosticEndpoint: document.querySelector("#apiDiagnosticEndpoint"),
    copyDiagnosticButton: document.querySelector("#copyDiagnosticButton"),
    testKeyButton: document.querySelector("#testKeyButton"),
    testModelButton: document.querySelector("#testModelButton"),
    replaceKeyButton: document.querySelector("#replaceKeyButton"),
    removeKeyButton: document.querySelector("#removeKeyButton"),
    askButton: document.querySelector("#askButton"),
    summarizeCurrentButton: document.querySelector("#summarizeCurrentButton"),
    improveCurrentButton: document.querySelector("#improveCurrentButton"),
    risksCurrentButton: document.querySelector("#risksCurrentButton"),
    promptLibraryButton: document.querySelector("#promptLibraryButton"),
    promptLibraryPanel: document.querySelector("#promptLibraryPanel"),
    promptLibraryList: document.querySelector("#promptLibraryList"),
    closePromptLibraryButton: document.querySelector("#closePromptLibraryButton"),
    strictCitations: document.querySelector("#strictCitations"),
    apiKeyInput: document.querySelector("#geminiApiKeyInput"),
    saveKeyButton: document.querySelector("#saveKeyButton"),
    cancelReplaceKeyButton: document.querySelector("#cancelReplaceKeyButton"),
    clearSessionButton: document.querySelector("#clearSessionButton"),
    clearChatButton: document.querySelector("#clearChatButton"),
    exportButton: document.querySelector("#exportButton"),
    dashboardExportButton: document.querySelector("#dashboardExportButton"),
    workflowMetric: document.querySelector("#workflowMetric"),
    graphMetric: document.querySelector("#graphMetric"),
    graphNodesMetric: document.querySelector("#graphNodesMetric"),
    graphEdgesMetric: document.querySelector("#graphEdgesMetric"),
    deckMetric: document.querySelector("#deckMetric"),
    slidesMetric: document.querySelector("#slidesMetric"),
    lastGraphMetric: document.querySelector("#lastGraphMetric"),
    lastDeckMetric: document.querySelector("#lastDeckMetric"),
    dashboardGraphButton: document.querySelector("#dashboardGraphButton"),
    dashboardDeckButton: document.querySelector("#dashboardDeckButton"),
    graphExampleButton: document.querySelector("#graphExampleButton"),
    graphExamplePanel: document.querySelector("#graphExamplePanel"),
    graphScopeSelect: document.querySelector("#graphScopeSelect"),
    graphScopeHelp: document.querySelector("#graphScopeHelp"),
    graphCategoryBlock: document.querySelector("#graphCategoryBlock"),
    graphDocumentSelectionBlock: document.querySelector("#graphDocumentSelectionBlock"),
    graphDocumentSelector: document.querySelector("#graphDocumentSelector"),
    graphDocumentSelectorButton: document.querySelector("#graphDocumentSelectorButton"),
    graphSelectedCount: document.querySelector("#graphSelectedCount"),
    graphDocumentDropdown: document.querySelector("#graphDocumentDropdown"),
    graphDocumentSearchInput: document.querySelector("#graphDocumentSearchInput"),
    closeGraphDocumentSelector: document.querySelector("#closeGraphDocumentSelector"),
    selectAllGraphDocuments: document.querySelector("#selectAllGraphDocuments"),
    clearGraphDocuments: document.querySelector("#clearGraphDocuments"),
    graphDocumentOptions: document.querySelector("#graphDocumentOptions"),
    graphSelectedChips: document.querySelector("#graphSelectedChips"),
    graphSelectionMessage: document.querySelector("#graphSelectionMessage"),
    graphSelectionAnnouncement: document.querySelector("#graphSelectionAnnouncement"),
    graphCategorySelect: document.querySelector("#graphCategorySelect"),
    graphSearchInput: document.querySelector("#graphSearchInput"),
    graphFiltersDisclosure: document.querySelector("#graphFiltersDisclosure"),
    graphSearchFilterGroup: document.querySelector("#graphSearchFilterGroup"),
    graphNodeTypeFilterGroup: document.querySelector("#graphNodeTypeFilterGroup"),
    graphNodeTypeFilter: document.querySelector("#graphNodeTypeFilter"),
    graphDocumentFilterGroup: document.querySelector("#graphDocumentFilterGroup"),
    graphDocumentFilter: document.querySelector("#graphDocumentFilter"),
    graphRelationshipFilterGroup: document.querySelector("#graphRelationshipFilterGroup"),
    graphRelationshipFilter: document.querySelector("#graphRelationshipFilter"),
    graphConfidenceFilterGroup: document.querySelector("#graphConfidenceFilterGroup"),
    graphConfidenceInput: document.querySelector("#graphConfidenceInput"),
    graphConfidenceValue: document.querySelector("#graphConfidenceValue"),
    hideIsolatedNodes: document.querySelector("#hideIsolatedNodes"),
    toggleGraphLabels: document.querySelector("#toggleGraphLabels"),
    generateGraphButton: document.querySelector("#generateGraphButton"),
    regenerateGraphButton: document.querySelector("#regenerateGraphButton"),
    clearGraphButton: document.querySelector("#clearGraphButton"),
    graphReadySummary: document.querySelector("#graphReadySummary"),
    graphZoomInButton: document.querySelector("#graphZoomInButton"),
    graphZoomOutButton: document.querySelector("#graphZoomOutButton"),
    graphFitButton: document.querySelector("#graphFitButton"),
    graphResetButton: document.querySelector("#graphResetButton"),
    graphFullscreenButton: document.querySelector("#graphFullscreenButton"),
    graphExportButton: document.querySelector("#graphExportButton"),
    graphExportPngButton: document.querySelector("#graphExportPngButton"),
    graphExportSvgButton: document.querySelector("#graphExportSvgButton"),
    graphExportNodesCsvButton: document.querySelector("#graphExportNodesCsvButton"),
    graphExportEdgesCsvButton: document.querySelector("#graphExportEdgesCsvButton"),
    graphStatus: document.querySelector("#graphStatus"),
    knowledgeGraphCanvas: document.querySelector("#knowledgeGraphCanvas"),
    graphDetailsPanel: document.querySelector("#graphDetailsPanel"),
    presentationTitleInput: document.querySelector("#presentationTitleInput"),
    presentationTypeSelect: document.querySelector("#presentationTypeSelect"),
    presentationAudienceSelect: document.querySelector("#presentationAudienceSelect"),
    presentationScopeSelect: document.querySelector("#presentationScopeSelect"),
    presentationSlideCountSelect: document.querySelector("#presentationSlideCountSelect"),
    customSlideCountInput: document.querySelector("#customSlideCountInput"),
    presentationToneSelect: document.querySelector("#presentationToneSelect"),
    deckCitationsOption: document.querySelector("#deckCitationsOption"),
    deckNotesOption: document.querySelector("#deckNotesOption"),
    deckRecommendationsOption: document.querySelector("#deckRecommendationsOption"),
    deckActionPlanOption: document.querySelector("#deckActionPlanOption"),
    deckGraphSlideOption: document.querySelector("#deckGraphSlideOption"),
    deckQuestionsOption: document.querySelector("#deckQuestionsOption"),
    deckThemeSelect: document.querySelector("#deckThemeSelect"),
    deckAccentInput: document.querySelector("#deckAccentInput"),
    deckCompanyInput: document.querySelector("#deckCompanyInput"),
    deckLogoInput: document.querySelector("#deckLogoInput"),
    deckFooterInput: document.querySelector("#deckFooterInput"),
    generateDeckButton: document.querySelector("#generateDeckButton"),
    deckStatus: document.querySelector("#deckStatus"),
    prevSlideButton: document.querySelector("#prevSlideButton"),
    nextSlideButton: document.querySelector("#nextSlideButton"),
    slideCounter: document.querySelector("#slideCounter"),
    deckFullscreenButton: document.querySelector("#deckFullscreenButton"),
    deckZoomOutButton: document.querySelector("#deckZoomOutButton"),
    deckZoomInButton: document.querySelector("#deckZoomInButton"),
    slidePreview: document.querySelector("#slidePreview"),
    exportDeckHtmlButton: document.querySelector("#exportDeckHtmlButton"),
    downloadPptxButton: document.querySelector("#downloadPptxButton"),
    printDeckButton: document.querySelector("#printDeckButton"),
    exportDeckJsonButton: document.querySelector("#exportDeckJsonButton"),
    slideTitleInput: document.querySelector("#slideTitleInput"),
    slideSubtitleInput: document.querySelector("#slideSubtitleInput"),
    slideBulletsInput: document.querySelector("#slideBulletsInput"),
    slideNotesInput: document.querySelector("#slideNotesInput"),
    saveSlideEditsButton: document.querySelector("#saveSlideEditsButton"),
    addSlideButton: document.querySelector("#addSlideButton"),
    duplicateSlideButton: document.querySelector("#duplicateSlideButton"),
    deleteSlideButton: document.querySelector("#deleteSlideButton"),
    moveSlideUpButton: document.querySelector("#moveSlideUpButton"),
    moveSlideDownButton: document.querySelector("#moveSlideDownButton"),
    regenerateSlideButton: document.querySelector("#regenerateSlideButton"),
    shortenSlideButton: document.querySelector("#shortenSlideButton"),
    expandNotesButton: document.querySelector("#expandNotesButton"),
    addRecommendationsSlideButton: document.querySelector("#addRecommendationsSlideButton"),
    addActionItemsSlideButton: document.querySelector("#addActionItemsSlideButton"),
    addGraphSlideButton: document.querySelector("#addGraphSlideButton"),
    referenceDrawer: document.querySelector("#referenceDrawer"),
    retrievalDebugPanel: document.querySelector("#retrievalDebugPanel"),
    fileProtocolWarning: document.querySelector("#fileProtocolWarning"),
  });
}

function hydrateSession() {
  const metadata = sessionStorage.getItem("peoplemind_metadata");
  runtimeGeminiApiKey = sessionStorage.getItem("peoplemind_gemini_key") || "";
  localStorage.removeItem("geminiApiKey");
  localStorage.removeItem("peoplemind_api_key");
  if (els.apiKeyInput) els.apiKeyInput.value = "";
  state.geminiModel = sessionStorage.getItem(GEMINI_MODEL_STORAGE_KEY) || DEFAULT_GEMINI_MODEL;
  if (els.geminiModelInput) els.geminiModelInput.value = state.geminiModel;
  state.apiConnectionStatus = runtimeGeminiApiKey ? "testing" : "no_key";
  state.apiReplaceMode = !runtimeGeminiApiKey;

  if (metadata) {
    try {
      const parsed = JSON.parse(metadata);
      state.mode = parsed.mode || state.mode;
      state.questionsAsked = parsed.questionsAsked || 0;
    } catch {
      sessionStorage.removeItem("peoplemind_metadata");
    }
  }

  if (els.fileProtocolWarning) {
    els.fileProtocolWarning.hidden = window.location.protocol !== "file:";
  }
  renderApiStatus();
  if (runtimeGeminiApiKey) {
    window.setTimeout(() => testGeminiConnection({ silent: true }), 0);
  }
}

function persistMetadata() {
  sessionStorage.setItem(
    "peoplemind_metadata",
    JSON.stringify({
      mode: state.mode,
      questionsAsked: state.questionsAsked,
    })
  );
}

function hasGeminiKey() {
  return Boolean(runtimeGeminiApiKey.trim());
}

function getSelectedGeminiModel() {
  const raw = String(els.geminiModelInput?.value || state.geminiModel || DEFAULT_GEMINI_MODEL).trim();
  const model = raw || DEFAULT_GEMINI_MODEL;
  state.geminiModel = model;
  sessionStorage.setItem(GEMINI_MODEL_STORAGE_KEY, model);
  return model;
}

function getGeminiEndpoint(model = getSelectedGeminiModel()) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function renderApiStatus() {
  const status = state.apiConnectionStatus || "no_key";
  const statusText = GEMINI_API_STATUS_LABELS[status] || GEMINI_API_STATUS_LABELS.no_key;
  const panelText = GEMINI_API_PANEL_LABELS[status] || GEMINI_API_PANEL_LABELS.no_key;
  Object.keys(GEMINI_API_STATUS_LABELS).forEach((statusClass) => els.apiStatusButton?.classList.remove(statusClass));
  els.apiStatusButton?.classList.add(status);
  if (els.apiStatusText) els.apiStatusText.textContent = statusText;
  els.apiStatusButton?.setAttribute("aria-label", statusText);

  if (els.apiConnectionStatus) {
    els.apiConnectionStatus.className = `api-connection-status ${status}`;
    const strong = els.apiConnectionStatus.querySelector("strong");
    if (strong) strong.textContent = panelText;
  }

  const keySaved = hasGeminiKey();
  const showReplaceForm = !keySaved || state.apiReplaceMode;
  if (els.apiSavedMessage) {
    els.apiSavedMessage.hidden = !keySaved || showReplaceForm;
    els.apiSavedMessage.textContent =
      status === "connected"
        ? "A key is securely stored for this browser session and the latest Gemini test succeeded. The saved key cannot be displayed."
        : "A key is securely stored for this browser session, but the current connection is not verified. The saved key cannot be displayed.";
  }
  if (els.apiConnectedActions) els.apiConnectedActions.hidden = !keySaved || showReplaceForm;
  if (els.apiReplaceForm) els.apiReplaceForm.hidden = keySaved && !showReplaceForm;
  if (els.apiInputLabel) els.apiInputLabel.textContent = keySaved ? "Replace Gemini API key" : "Gemini API key";
  if (els.apiKeyInput) {
    els.apiKeyInput.placeholder = keySaved ? "Paste a new Gemini API key" : "Paste Gemini API key";
  }
  if (els.saveKeyButton) {
    els.saveKeyButton.innerHTML = `<i data-lucide="key-round"></i>${keySaved ? "Save New Key" : "Save Key"}`;
  }
  if (els.cancelReplaceKeyButton) els.cancelReplaceKeyButton.hidden = !keySaved || !state.apiReplaceMode;
  if (els.geminiModelInput && els.geminiModelInput.value !== state.geminiModel) {
    els.geminiModelInput.value = state.geminiModel;
  }
  if (els.apiDiagnosticStatus) els.apiDiagnosticStatus.textContent = panelText;
  if (els.apiDiagnosticModel) els.apiDiagnosticModel.textContent = state.geminiModel || DEFAULT_GEMINI_MODEL;
  if (els.apiDiagnosticLastSuccess) els.apiDiagnosticLastSuccess.textContent = formatDiagnosticTime(state.lastSuccessfulGeminiTest);
  if (els.apiDiagnosticLastFailure) els.apiDiagnosticLastFailure.textContent = formatDiagnosticTime(state.lastFailedGeminiTest);
  if (els.apiDiagnosticHttpStatus) els.apiDiagnosticHttpStatus.textContent = String(state.lastGeminiHttpStatus || "Not tested");
  if (els.apiDiagnosticSafeCode) els.apiDiagnosticSafeCode.textContent = state.lastGeminiSafeCode || "none";
  if (els.apiDiagnosticSafeMessage) els.apiDiagnosticSafeMessage.textContent = state.lastGeminiSafeMessage || "No API key saved.";
  if (els.apiDiagnosticEndpoint) els.apiDiagnosticEndpoint.textContent = state.lastGeminiEndpoint || getGeminiEndpoint(state.geminiModel || DEFAULT_GEMINI_MODEL);
}

function setApiFeedback(message = "", tone = "") {
  if (!els.apiKeyFeedback) return;
  els.apiKeyFeedback.textContent = message;
  els.apiKeyFeedback.className = `api-feedback ${tone}`.trim();
}

function formatDiagnosticTime(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setApiStatus(status, details = {}) {
  state.apiConnectionStatus = status;
  if (details.model) state.geminiModel = details.model;
  if (details.endpoint) state.lastGeminiEndpoint = details.endpoint;
  if ("httpStatus" in details) state.lastGeminiHttpStatus = details.httpStatus || "Not tested";
  if (details.safeCode) state.lastGeminiSafeCode = details.safeCode;
  if (details.safeMessage) state.lastGeminiSafeMessage = redactSensitiveText(details.safeMessage);
  if (status === "no_key") {
    state.lastGeminiHttpStatus = "Not tested";
    state.lastGeminiSafeCode = "none";
    state.lastGeminiSafeMessage = "No API key saved.";
  }
  if (status === "testing") {
    state.lastGeminiHttpStatus = "Pending";
    state.lastGeminiSafeCode = "testing";
    state.lastGeminiSafeMessage = details.safeMessage || "Testing Gemini connection.";
  }
  if (status === "connected") {
    state.lastSuccessfulGeminiTest = details.successAt || Date.now();
    state.lastGeminiHttpStatus = details.httpStatus || 200;
    state.lastGeminiSafeCode = "ok";
    state.lastGeminiSafeMessage = details.safeMessage || "Gemini request succeeded.";
  }
  if (!["connected", "testing", "no_key"].includes(status)) {
    state.lastFailedGeminiTest = details.failedAt || Date.now();
  }
  renderApiStatus();
}

function redactSensitiveText(value) {
  let safe = String(value || "");
  if (runtimeGeminiApiKey) safe = safe.split(runtimeGeminiApiKey).join("[redacted api key]");
  return safe.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted api key]");
}

function compactGeminiValue(value) {
  if (Array.isArray(value)) return value.map(compactGeminiValue).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return value === undefined ? undefined : value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, compactGeminiValue(item)])
      .filter(([, item]) => item !== undefined)
  );
}

function getGeminiResponseText(data) {
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
}

function createGeminiClientError(apiStatus, safeMessage, details = {}) {
  const error = new Error(safeMessage);
  error.apiStatus = apiStatus;
  error.status = details.httpStatus || details.status || 0;
  error.safeCode = details.safeCode || apiStatus;
  error.safeMessage = redactSensitiveText(safeMessage);
  error.model = details.model || state.geminiModel || DEFAULT_GEMINI_MODEL;
  error.endpoint = details.endpoint || getGeminiEndpoint(error.model);
  return error;
}

function getGeminiErrorCategory(status) {
  if (status === 401) return "invalid_key";
  if (status === 403) return "permission_denied";
  if (status === 429) return "quota_exceeded";
  if (status === 400 || status === 404) return "invalid_model";
  if ([500, 502, 503, 504].includes(status)) return "service_unavailable";
  return "service_unavailable";
}

function getGeminiSafeMessage(status) {
  if (status === 400) return "Gemini rejected the request. Check the request format and selected model.";
  if (status === 401) return "The Gemini API key was not accepted.";
  if (status === 403) return "This key does not have permission to use the Gemini API. Check the Google Cloud project and API restrictions.";
  if (status === 404) return "The selected Gemini model or endpoint was not found. Choose a supported model.";
  if (status === 429) return "The Gemini API quota or rate limit has been exceeded. Wait and try again or check the project quota.";
  if ([500, 502, 503, 504].includes(status)) return "Gemini is temporarily unavailable. Please try again shortly.";
  return "Gemini request failed. Please test the connection again.";
}

function handleGeminiApiError(status, errorData, details = {}) {
  const apiStatus = getGeminiErrorCategory(status);
  const model = details.model || state.geminiModel || DEFAULT_GEMINI_MODEL;
  const endpoint = details.endpoint || getGeminiEndpoint(model);
  const providerCode = String(errorData?.error?.status || errorData?.error?.code || `HTTP_${status}`).trim();
  const providerMessage = redactSensitiveText(errorData?.error?.message || "");
  const baseMessage = getGeminiSafeMessage(status);
  const safeMessage = providerMessage ? `${baseMessage} Gemini said: ${providerMessage}` : baseMessage;
  setApiStatus(apiStatus, {
    httpStatus: status,
    safeCode: providerCode,
    safeMessage,
    model,
    endpoint,
    failedAt: Date.now(),
  });
  return createGeminiClientError(apiStatus, safeMessage, {
    httpStatus: status,
    safeCode: providerCode,
    model,
    endpoint,
  });
}

async function callGemini({ contents, systemInstruction, generationConfig, signal, model = getSelectedGeminiModel() }) {
  const selectedModel = String(model || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const endpoint = getGeminiEndpoint(selectedModel);
  state.geminiModel = selectedModel;
  if (!runtimeGeminiApiKey) {
    setApiStatus("no_key", { model: selectedModel, endpoint });
    throw createGeminiClientError("no_key", "No Gemini API key is saved for this browser session.", {
      model: selectedModel,
      endpoint,
    });
  }

  const requestBody = compactGeminiValue({
    system_instruction: systemInstruction ? { parts: [{ text: String(systemInstruction) }] } : undefined,
    contents,
    generationConfig,
  });

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": runtimeGeminiApiKey,
      },
      signal,
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    const networkError = createGeminiClientError(
      "network_error",
      "Could not connect to Gemini. Check your network connection.",
      { model: selectedModel, endpoint, safeCode: "network_error" }
    );
    setApiStatus("network_error", {
      httpStatus: "Network error",
      safeCode: "network_error",
      safeMessage: networkError.safeMessage,
      model: selectedModel,
      endpoint,
      failedAt: Date.now(),
    });
    throw networkError;
  }

  const responseData = await response.json().catch(() => null);
  if (!response.ok) {
    throw handleGeminiApiError(response.status, responseData, { model: selectedModel, endpoint });
  }

  const text = getGeminiResponseText(responseData);
  if (!text) {
    const emptyError = createGeminiClientError(
      "service_unavailable",
      "Gemini returned an empty or malformed response.",
      { httpStatus: response.status, model: selectedModel, endpoint, safeCode: "malformed_response" }
    );
    setApiStatus("service_unavailable", {
      httpStatus: response.status,
      safeCode: "malformed_response",
      safeMessage: emptyError.safeMessage,
      model: selectedModel,
      endpoint,
      failedAt: Date.now(),
    });
    throw emptyError;
  }

  setApiStatus("connected", {
    httpStatus: response.status,
    safeMessage: "Gemini request succeeded.",
    model: selectedModel,
    endpoint,
    successAt: Date.now(),
  });
  return { data: responseData, text, model: selectedModel, endpoint, httpStatus: response.status };
}

async function testGeminiConnection(options = {}) {
  if (!runtimeGeminiApiKey) {
    setApiStatus("no_key");
    setApiFeedback("Save a Gemini API key before testing the connection.", "warning");
    return false;
  }
  const testId = ++activeGeminiTestId;
  const model = getSelectedGeminiModel();
  setApiStatus("testing", {
    model,
    endpoint: getGeminiEndpoint(model),
    safeMessage: "Testing Gemini connection.",
  });
  if (!options.silent) setApiFeedback("Testing Gemini connection...", "");
  try {
    const result = await callGemini({
      contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8 },
    });
    if (testId !== activeGeminiTestId) return false;
    setApiStatus("connected", {
      httpStatus: result.httpStatus,
      safeMessage: "Connection test succeeded.",
      model: result.model,
      endpoint: result.endpoint,
      successAt: Date.now(),
    });
    setApiFeedback("Gemini connection verified.", "success");
    return true;
  } catch (error) {
    if (error?.name === "AbortError" || testId !== activeGeminiTestId) return false;
    if (!error?.apiStatus) {
      setApiStatus("service_unavailable", {
        safeCode: "request_failed",
        safeMessage: error?.message || "Gemini request failed.",
        model,
        endpoint: getGeminiEndpoint(model),
        failedAt: Date.now(),
      });
    }
    setApiFeedback(`Connection test failed: ${error.safeMessage || error.message || "Gemini request failed."}`, "warning");
    return false;
  } finally {
    renderApiStatus();
    refreshIcons();
  }
}

function buildApiDiagnosticReport() {
  return [
    "PeopleMind AI Gemini Diagnostic",
    `Connection Status: ${GEMINI_API_PANEL_LABELS[state.apiConnectionStatus] || state.apiConnectionStatus || "Unknown"}`,
    `Selected Model: ${state.geminiModel || DEFAULT_GEMINI_MODEL}`,
    `Last Successful Test: ${formatDiagnosticTime(state.lastSuccessfulGeminiTest)}`,
    `Last Failed Test: ${formatDiagnosticTime(state.lastFailedGeminiTest)}`,
    `HTTP Status: ${state.lastGeminiHttpStatus || "Not tested"}`,
    `Safe Error Code: ${state.lastGeminiSafeCode || "none"}`,
    `Safe Error Message: ${redactSensitiveText(state.lastGeminiSafeMessage || "")}`,
    `Endpoint: ${state.lastGeminiEndpoint || getGeminiEndpoint(state.geminiModel || DEFAULT_GEMINI_MODEL)}`,
  ].join("\n");
}

async function copyApiDiagnosticReport() {
  const report = buildApiDiagnosticReport();
  await navigator.clipboard?.writeText(report);
  setApiFeedback("Diagnostic report copied without API key or document text.", "success");
}

function renderPromptLibrary() {
  if (!els.promptLibraryList || els.promptLibraryList.dataset.rendered === "true") return;
  els.promptLibraryList.innerHTML = suggestedQuestionPrompts
    .map((prompt, index) => `<button class="prompt-button" type="button" data-prompt-index="${index}">${escapeHtml(prompt)}</button>`)
    .join("");
  els.promptLibraryList.dataset.rendered = "true";
}

function renderAll() {
  renderDashboard();
  renderDocuments();
  renderPreview();
  renderChat();
  renderApiStatus();
  renderPromptLibrary();
  renderWorkflow();
  renderGraphSettings();
  renderKnowledgeGraph();
  renderPresentationDeck();
  renderRetrievalDebug();
  refreshIcons();
}

function createWorkflowState() {
  return {
    summary: "Ready",
    requestId: "",
    question: "",
    intent: "Waiting",
    searchScope: "All ready documents",
    targetDocument: "None detected",
    documentsSearched: 0,
    sectionsChecked: 0,
    evidenceSelected: 0,
    model: "Not used yet",
    citationValidation: "Not run yet",
    referencesValidated: 0,
    referencesTotal: 0,
    status: "waiting",
    startedAt: null,
    completedAt: null,
    durationMs: 0,
    documents: [],
    topMatches: [],
    evidencePreviews: [],
    validationResult: null,
    errors: [],
    warnings: [],
    steps: workflowTemplate.map((step) => ({ ...step, status: "waiting", detail: step.detail, startedAt: null, completedAt: null, durationMs: 0 })),
  };
}

function createEmptyGraph() {
  return {
    nodes: [],
    edges: [],
    sources: [],
    generatedAt: null,
    status: "waiting",
    scope: "All Ready Documents",
    selectedItemId: null,
  };
}

function createEmptyDeck() {
  return {
    deckTitle: "PeopleMind AI HR Analysis",
    subtitle: "Evidence-based HR document intelligence",
    slides: [],
    generatedAt: null,
    status: "waiting",
    theme: "PeopleMind Red",
    zoom: 1,
  };
}

function resetWorkflow(summary = "Ready") {
  state.workflow = createWorkflowState();
  state.workflow.summary = summary;
  state.currentWorkflow = state.workflow;
  renderWorkflow();
}

function setWorkflowStep(id, status, detail = "") {
  if (!state.workflow) resetWorkflow();
  const canonicalId = workflowAliasMap[id] || id;
  const normalizedStatus = workflowStatusMap[status] || status || "waiting";
  const now = performance.now();
  state.workflow.steps = state.workflow.steps.map((step) => {
    if (step.id !== canonicalId) return step;
    const startedAt = step.startedAt || (normalizedStatus === "running" ? now : step.startedAt);
    const completedAt = ["completed", "warning", "failed", "skipped"].includes(normalizedStatus) ? now : step.completedAt;
    return {
      ...step,
      status: normalizedStatus,
      detail: detail || step.detail,
      startedAt,
      completedAt,
      durationMs: startedAt && completedAt ? Math.round(completedAt - startedAt) : step.durationMs || 0,
    };
  });
  const activeStep = state.workflow.steps.find((step) => step.status === "running");
  const warningStep = state.workflow.steps.find((step) => step.status === "warning" || step.status === "failed");
  if (activeStep) {
    state.workflow.summary = activeStep.label;
    state.workflow.status = "running";
  } else if (warningStep) {
    state.workflow.summary = warningStep.label;
    state.workflow.status = warningStep.status;
  } else if (state.workflow.steps.every((step) => step.status === "completed")) {
    state.workflow.summary = "Completed";
    state.workflow.status = "completed";
  }
  state.currentWorkflow = state.workflow;
  renderWorkflow();
}

function renderWorkflow() {
  const workflow = state.workflow || createWorkflowState();
  if (els.workflowSummary) els.workflowSummary.textContent = workflow.summary || "Ready";
  if (els.workflowRequestId) els.workflowRequestId.textContent = workflow.requestId || "No request yet";
  if (els.workflowQuestion) els.workflowQuestion.textContent = workflow.question || "No workflow requests have been processed yet.";
  if (els.workflowIntent) els.workflowIntent.textContent = workflow.intent || "Waiting";
  if (els.workflowSearchScope) els.workflowSearchScope.textContent = workflow.searchScope || "All ready documents";
  if (els.workflowTargetDocument) els.workflowTargetDocument.textContent = workflow.targetDocument || "None detected";
  if (els.workflowDocsSearched) els.workflowDocsSearched.textContent = String(workflow.documentsSearched || 0);
  if (els.workflowSectionsChecked) els.workflowSectionsChecked.textContent = String(workflow.sectionsChecked || 0);
  if (els.workflowEvidenceSelected) els.workflowEvidenceSelected.textContent = `${workflow.evidenceSelected || 0} passage${workflow.evidenceSelected === 1 ? "" : "s"}`;
  if (els.workflowModel) els.workflowModel.textContent = workflow.model || "Not used yet";
  if (els.workflowCitationValidation) els.workflowCitationValidation.textContent = workflow.citationValidation || "Not run yet";
  if (els.workflowDuration) els.workflowDuration.textContent = formatDuration(workflow.durationMs || getWorkflowDuration(workflow));
  if (els.workflowStatusPill) {
    els.workflowStatusPill.textContent = titleCaseStatus(workflow.status || "waiting");
    els.workflowStatusPill.className = `status-pill ${escapeHtml(workflow.status || "waiting")}`;
  }

  if (els.workflowList) {
    els.workflowList.innerHTML = workflow.steps
    .map(
      (step) => `<li class="${escapeHtml(step.status)}">
        <span class="workflow-dot" aria-hidden="true"></span>
        <span class="workflow-number">${escapeHtml(String(step.number))}</span>
        <div>
          <strong>${escapeHtml(step.label)}</strong>
          <small>${escapeHtml(step.detail)}</small>
          <em>${escapeHtml(titleCaseStatus(step.status))}${step.durationMs ? ` - ${escapeHtml(formatDuration(step.durationMs))}` : ""}</em>
        </div>
      </li>`
    )
    .join("");
  }
  renderWorkflowHistory();
  refreshIcons();
}

function renderWorkflowHistory() {
  if (!els.workflowHistoryList) return;
  const history = state.workflowHistory || [];
  if (els.workflowHistoryCount) els.workflowHistoryCount.textContent = `${history.length} request${history.length === 1 ? "" : "s"}`;
  if (!history.length) {
    els.workflowHistoryList.innerHTML = `<div class="empty-card">No workflow requests have been processed yet.</div>`;
    if (els.workflowDetailPanel) {
      els.workflowDetailPanel.hidden = true;
      els.workflowDetailPanel.innerHTML = "";
    }
    return;
  }
  els.workflowHistoryList.innerHTML = history
    .slice(0, 12)
    .map(
      (item) => `<article class="workflow-history-item">
        <div>
          <strong>${escapeHtml(shorten(item.question || "Untitled request", 86))}</strong>
          <span>${escapeHtml(new Date(item.startedAt || Date.now()).toLocaleTimeString())} - ${escapeHtml(item.intent || "Document question")}</span>
        </div>
        <dl>
          <div><dt>Target</dt><dd>${escapeHtml(item.targetDocument || "All documents")}</dd></div>
          <div><dt>Status</dt><dd><span class="status-pill ${escapeHtml(item.status || "waiting")}">${escapeHtml(titleCaseStatus(item.status || "waiting"))}</span></dd></div>
          <div><dt>Duration</dt><dd>${escapeHtml(formatDuration(item.durationMs || 0))}</dd></div>
          <div><dt>References</dt><dd>${escapeHtml(String(item.referencesValidated || 0))} verified</dd></div>
        </dl>
        <button class="small-button" type="button" data-workflow-detail="${escapeHtml(item.requestId)}">View Details</button>
      </article>`
    )
    .join("");
}

function renderWorkflowDetail(requestId) {
  if (!els.workflowDetailPanel) return;
  const item = state.workflowHistory.find((entry) => entry.requestId === requestId);
  if (!item) return;
  els.workflowDetailPanel.hidden = false;
  els.workflowDetailPanel.innerHTML = `<div class="panel-heading">
      <h2>Workflow Details</h2>
      <span class="status-pill ${escapeHtml(item.status || "waiting")}">${escapeHtml(titleCaseStatus(item.status || "waiting"))}</span>
    </div>
    <div class="workflow-detail-grid">
      <section>
        <h3>Stages</h3>
        <ol class="workflow-list detail">
          ${(item.steps || [])
            .map(
              (step) => `<li class="${escapeHtml(step.status)}">
                <span class="workflow-dot" aria-hidden="true"></span>
                <span class="workflow-number">${escapeHtml(String(step.number))}</span>
                <div><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.detail)}</small><em>${escapeHtml(titleCaseStatus(step.status))}${step.durationMs ? ` - ${escapeHtml(formatDuration(step.durationMs))}` : ""}</em></div>
              </li>`
            )
            .join("")}
        </ol>
      </section>
      <section>
        <h3>Documents Searched</h3>
        <div class="compact-list">
          ${(item.documents || []).map((doc) => `<div><strong>${escapeHtml(doc.name)}</strong><span>${escapeHtml(String(doc.sections || 0))} sections checked</span></div>`).join("") || "<p>No documents searched.</p>"}
        </div>
      </section>
      <section>
        <h3>Top Matching Documents</h3>
        <div class="compact-list">
          ${(item.topMatches || []).map((match) => `<div><strong>${escapeHtml(match.filename || match.docName || "Document")}</strong><span>Score ${escapeHtml(String(match.score || 0))}</span></div>`).join("") || "<p>No matches recorded.</p>"}
        </div>
      </section>
      <section>
        <h3>Selected Evidence</h3>
        <div class="compact-list evidence">
          ${(item.evidencePreviews || [])
            .map((ev) => `<div><strong>${escapeHtml(ev.sourceId)} - ${escapeHtml(ev.filename)} ${escapeHtml(ev.location || "")}</strong><span>${escapeHtml(ev.quote || "")}</span></div>`)
            .join("") || "<p>No evidence selected.</p>"}
        </div>
      </section>
      <section>
        <h3>Validation</h3>
        <p>${escapeHtml(item.citationValidation || "Not run")}</p>
        ${(item.warnings || []).map((warning) => `<p class="warning-text">${escapeHtml(warning)}</p>`).join("")}
        ${(item.errors || []).map((error) => `<p class="danger-text">${escapeHtml(error)}</p>`).join("")}
      </section>
    </div>`;
  refreshIcons();
}

function exportWorkflowLog() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "PeopleMind AI",
    currentWorkflow: state.workflow ? sanitizeWorkflowForExport(state.workflow) : null,
    history: state.workflowHistory.map(sanitizeWorkflowForExport),
  };
  downloadJson(payload, "peoplemind-workflow-log.json");
}

function titleCaseStatus(status) {
  return String(status || "waiting")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

function getWorkflowDuration(workflow) {
  if (!workflow?.startedAt) return 0;
  return Math.round((workflow.completedAt || performance.now()) - workflow.startedAt);
}

function formatDuration(ms) {
  const value = Math.max(0, Math.round(Number(ms) || 0));
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`;
}

function getSearchableDocuments() {
  return dedupeDocumentsByContentHash(state.documents.filter((doc) => doc.processingStatus === "ready" && doc.searchChunks.length > 0));
}

function dedupeDocumentsByContentHash(documents) {
  const seenHashes = new Set();
  return documents.filter((doc) => {
    const hash = doc.contentHash || "";
    if (!hash) return true;
    if (seenHashes.has(hash)) return false;
    seenHashes.add(hash);
    return true;
  });
}

function getReadyDocumentById(id) {
  return getSearchableDocuments().find((doc) => doc.id === id) || null;
}

function getSearchScopeLabel(scope = state.searchScope) {
  if (scope === "current") return "Current Preview Document";
  if (scope === "selected") return "Choose Documents";
  return "All Ready Documents";
}

function getQuestionPlaceholder() {
  const readyDocs = getSearchableDocuments();
  if (state.searchScope === "current") {
    const doc = getReadyDocumentById(state.previewDocumentId);
    return doc ? `Ask about ${doc.name}...` : "Ask about the current preview document...";
  }
  if (state.searchScope === "selected") return "Ask across the selected documents...";
  return `Ask across all uploaded HR documents...`;
}

function getScopeHintText() {
  const readyDocs = getSearchableDocuments();
  if (state.searchScope === "current") {
    const doc = getReadyDocumentById(state.previewDocumentId);
    return doc ? `Questions search only ${doc.name}.` : "Select a ready preview document to use current-document search.";
  }
  if (state.searchScope === "selected") {
    const selected = state.selectedSearchDocumentIds.filter((id) => readyDocs.some((doc) => doc.id === id));
    return selected.length ? `Questions search ${selected.length} selected document${selected.length === 1 ? "" : "s"}.` : "Choose at least one ready document.";
  }
  return `Questions search all ${readyDocs.length} ready document${readyDocs.length === 1 ? "" : "s"}.`;
}

function renderSearchScopeControls() {
  const readyDocs = getSearchableDocuments();
  state.selectedSearchDocumentIds = state.selectedSearchDocumentIds.filter((id) => readyDocs.some((doc) => doc.id === id));
  if (els.searchScopeSelect) els.searchScopeSelect.value = state.searchScope || "all";
  if (els.searchScopeHint) els.searchScopeHint.textContent = getScopeHintText();
  if (els.questionInput) els.questionInput.placeholder = getQuestionPlaceholder();
  if (els.selectedSearchDocumentsPanel) els.selectedSearchDocumentsPanel.hidden = state.searchScope !== "selected";
  if (els.selectedSearchDocumentsList) {
    const selectedCount = state.selectedSearchDocumentIds.filter((id) => readyDocs.some((doc) => doc.id === id)).length;
    els.selectedSearchDocumentsList.innerHTML = readyDocs.length
      ? `<div class="selected-documents-summary">
          <span>${selectedCount} selected</span>
          <small>${readyDocs.length} ready documents</small>
        </div>` +
        readyDocs
          .map(
            (doc) => `<label class="scope-doc-option">
              <input type="checkbox" data-search-doc-id="${escapeHtml(doc.id)}" ${state.selectedSearchDocumentIds.includes(doc.id) ? "checked" : ""} />
              <span class="scope-doc-name">${escapeHtml(doc.name)}</span>
            </label>`
          )
          .join("")
      : `<p class="helper-text">Upload ready documents before choosing a search scope.</p>`;
  }
  const hasPreviewReady = Boolean(getReadyDocumentById(state.previewDocumentId));
  if (els.askAboutFileButton) els.askAboutFileButton.disabled = !hasPreviewReady;
  if (els.searchAllDocumentsButton) els.searchAllDocumentsButton.disabled = state.searchScope === "all";
}

function renderDashboard() {
  const readyDocuments = getSearchableDocuments();
  els.totalDocsMetric.textContent = dedupeDocumentsByContentHash(state.documents).length;
  els.activeDocsMetric.textContent = readyDocuments.length;
  els.questionsMetric.textContent = state.questionsAsked;
  if (els.workflowMetric) els.workflowMetric.textContent = String(state.workflowHistory.length);
  if (els.graphMetric) els.graphMetric.textContent = String(state.metrics.graphsGenerated || 0);
  if (els.graphNodesMetric) els.graphNodesMetric.textContent = String(state.currentGraph.nodes.length || 0);
  if (els.graphEdgesMetric) els.graphEdgesMetric.textContent = String(state.currentGraph.edges.length || 0);
  if (els.deckMetric) els.deckMetric.textContent = String(state.metrics.decksGenerated || 0);
  if (els.slidesMetric) els.slidesMetric.textContent = String(state.presentationDeck.slides.length || state.metrics.slidesGenerated || 0);
  if (els.lastGraphMetric) els.lastGraphMetric.textContent = state.metrics.lastGraphGeneration ? new Date(state.metrics.lastGraphGeneration).toLocaleString() : "No graph generated yet.";
  if (els.lastDeckMetric) els.lastDeckMetric.textContent = state.metrics.lastPresentationGeneration ? new Date(state.metrics.lastPresentationGeneration).toLocaleString() : "No presentation generated yet.";
  els.activeCountBadge.textContent = `${readyDocuments.length} document${readyDocuments.length === 1 ? "" : "s"} ready for search`;
  renderSearchScopeControls();

  const recentDocs = state.documents
    .filter((doc) => doc.lastAnalyzedAt)
    .sort((a, b) => b.lastAnalyzedAt - a.lastAnalyzedAt)
    .slice(0, 3)
    .map((doc) => doc.name);
  els.recentDocsList.textContent = recentDocs.length ? recentDocs.join(", ") : "No documents analyzed yet.";
}

function renderDocuments() {
  if (!state.documents.length) {
    els.documentList.innerHTML = `<div class="message system"><strong>No documents</strong><p>Upload HR files to begin.</p></div>`;
    return;
  }

  els.documentList.innerHTML = state.documents
    .map((doc) => {
      const isSelected = doc.id === state.previewDocumentId;
      const statusClass = doc.processingStatus === "failed" ? "review" : "";
      const version = doc.version > 1 ? `<span class="flag">Version ${doc.version}</span>` : "";
      const modified = doc.isModified ? '<span class="flag review">Unsaved changes</span>' : "";
      return `<article class="reference-item ${isSelected ? "selected" : ""}">
        <div class="reference-top">
          <div>
            <button class="reference-title" type="button" data-select="${doc.id}">${escapeHtml(doc.name)}</button>
            <p class="reference-meta">${escapeHtml(statusLabel(doc))}</p>
          </div>
          <div class="reference-actions">
            <button class="tiny-button danger" type="button" title="Remove document" aria-label="Remove ${escapeHtml(doc.name)}" data-remove="${doc.id}">
              <i data-lucide="x"></i>
            </button>
          </div>
        </div>
        <div class="flag-row">
          <span class="flag">${escapeHtml(doc.typeLabel)}</span>
          <span class="flag ${statusClass}">${escapeHtml(doc.processingStatus)}</span>
          ${version}
          ${modified}
        </div>
      </article>`;
    })
    .join("");
}

function statusLabel(doc) {
  if (doc.processingStatus === "ready") {
    const unit = doc.type === "pdf" ? "page" : "section";
    const count = doc.type === "pdf" ? doc.pageCount || doc.pages.length : doc.searchChunks.length;
    return `${count} ${unit}${count === 1 ? "" : "s"} - searchable`;
  }
  return doc.statusMessage || doc.processingStatus;
}

async function renderPreview() {
  const doc = getPreviewDocument();
  const token = ++state.renderToken;
  els.documentPreview.onscroll = null;

  if (!doc) {
    els.previewDocumentName.textContent = "No document previewing";
    els.previewMeta.textContent = "Upload a file to preview it";
    els.pageInput.value = "";
    els.pageIndicator.textContent = "No document";
    updateViewerControls(false);
    els.documentPreview.innerHTML = `<div class="empty-preview">
      <i data-lucide="file-search"></i>
      <h2>Upload HR documents</h2>
      <p>Preview a file here. Questions always search every successfully processed uploaded document.</p>
    </div>`;
    return;
  }

  els.previewDocumentName.textContent = doc.name;
  els.previewMeta.textContent = `${doc.typeLabel} - ${doc.processingStatus}`;
  els.zoomIndicator.textContent = `${state.zoom}%`;
  updateViewerControls(doc.processingStatus !== "failed");

  if (doc.processingStatus === "failed") {
    els.pageInput.value = "";
    els.pageIndicator.textContent = "failed";
    els.documentPreview.innerHTML = `<div class="empty-preview error-preview">
      <i data-lucide="triangle-alert"></i>
      <h2>Document failed</h2>
      <p>${escapeHtml(doc.statusMessage || "This file could not be processed.")}</p>
    </div>`;
    return;
  }

  if (doc.processingStatus !== "ready") {
    els.pageInput.value = "";
    els.pageIndicator.textContent = "Processing";
    els.documentPreview.innerHTML = `<div class="empty-preview">
      <i data-lucide="loader"></i>
      <h2>${escapeHtml(doc.processingStatus)}</h2>
      <p>${escapeHtml(doc.statusMessage || "Preparing the document.")}</p>
    </div>`;
    return;
  }

  try {
    if (doc.type === "pdf") {
      await renderPdfPreview(doc, token);
    } else if (doc.type === "docx") {
      await renderDocxPreview(doc, token);
    } else if (doc.type === "markdown") {
      renderMarkdownPreview(doc);
    } else {
      renderTextPreview(doc);
    }
  } catch (error) {
    if (token !== state.renderToken) return;
    els.documentPreview.innerHTML = `<div class="empty-preview error-preview">
      <i data-lucide="triangle-alert"></i>
      <h2>Preview failed</h2>
      <p>Text extracted successfully, but the original document preview could not be displayed. ${escapeHtml(error.message)}</p>
    </div>`;
  } finally {
    refreshIcons();
  }
}

function updateViewerControls(enabled) {
  [
    els.prevPageButton,
    els.nextPageButton,
    els.pageInput,
    els.zoomOutButton,
    els.zoomInButton,
    els.resetZoomButton,
    els.fitWidthButton,
    els.rotateButton,
    els.viewerSearchInput,
    els.downloadDocumentButton,
    els.fullscreenButton,
  ].forEach((control) => {
    control.disabled = !enabled;
  });
}

async function renderPdfPreview(doc, token) {
  if (!window.pdfjsLib) {
    renderPdfTextFallbackPreview(doc, token);
    return;
  }
  if (!doc.pdfHandle) {
    doc.pdfHandle = await window.pdfjsLib.getDocument({ data: new Uint8Array(doc.arrayBuffer.slice(0)) }).promise;
  }

  const pageCount = doc.pdfHandle.numPages;
  state.previewPageIndex = clamp(state.previewPageIndex, 0, pageCount - 1);
  const pageNumber = state.previewPageIndex + 1;
  const page = await doc.pdfHandle.getPage(pageNumber);
  if (token !== state.renderToken) return;

  const naturalViewport = page.getViewport({ scale: 1, rotation: state.rotation });
  const scale = getPreviewFitScale(naturalViewport.width) * (state.zoom / 100);
  const viewport = page.getViewport({ scale, rotation: state.rotation });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const pageWrap = document.createElement("div");
  pageWrap.className = "pdf-page-sheet";
  pageWrap.appendChild(canvas);

  const textLayer = document.createElement("div");
  textLayer.className = "pdf-text-layer";
  pageWrap.appendChild(textLayer);

  els.documentPreview.innerHTML = "";
  els.documentPreview.appendChild(pageWrap);
  els.pageInput.value = String(pageNumber);
  els.pageInput.max = String(pageCount);
  els.pageIndicator.textContent = `of ${pageCount}`;
  els.prevPageButton.disabled = pageNumber <= 1;
  els.nextPageButton.disabled = pageNumber >= pageCount;

  await page.render({ canvasContext: context, viewport }).promise;
  await renderPdfTextLayer(page, viewport, textLayer);
}

function renderPdfTextFallbackPreview(doc, token) {
  if (token !== state.renderToken) return;
  const pages = doc.pages?.length ? doc.pages : chunkTextToSections(doc.extractedText || "No readable PDF text was found.");
  state.previewPageIndex = clamp(state.previewPageIndex, 0, Math.max(0, pages.length - 1));
  const page = pages[state.previewPageIndex] || pages[0];
  els.documentPreview.innerHTML = `<div class="preview-page text-page pdf-fallback-page" style="font-size:${state.zoom}%">
    <div class="preview-warning">PDF.js could not be loaded, so PeopleMind AI is showing a searchable text preview.</div>
    <p>${escapeHtml(page?.text || "No readable PDF text was found.")}</p>
  </div>`;
  els.previewMeta.textContent = "PDF - Ready with text preview";
  els.pageInput.disabled = false;
  els.pageInput.value = String(state.previewPageIndex + 1);
  els.pageInput.max = String(pages.length || 1);
  els.pageIndicator.textContent = `of ${pages.length || 1}`;
  els.prevPageButton.disabled = state.previewPageIndex <= 0;
  els.nextPageButton.disabled = state.previewPageIndex >= pages.length - 1;
}

async function renderPdfTextLayer(page, viewport, container) {
  try {
    const textContent = await page.getTextContent();
    if (window.pdfjsLib?.TextLayer) {
      const textLayer = new window.pdfjsLib.TextLayer({
        textContentSource: textContent,
        container,
        viewport,
      });
      await textLayer.render();
      return;
    }

    textContent.items.forEach((item) => {
      const span = document.createElement("span");
      span.textContent = item.str;
      span.style.left = `${item.transform[4]}px`;
      span.style.top = `${viewport.height - item.transform[5]}px`;
      span.style.fontSize = `${Math.max(8, item.height)}px`;
      container.appendChild(span);
    });
  } catch {
    container.remove();
  }
}

function getPreviewContentWidth() {
  if (!els.documentPreview) return 720;
  const styles = getComputedStyle(els.documentPreview);
  const horizontalPadding = parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0");
  return Math.max(320, els.documentPreview.clientWidth - horizontalPadding - 12);
}

function getPreviewFitScale(naturalWidth) {
  const width = Math.max(1, Number(naturalWidth) || 816);
  return Math.min(1.5, getPreviewContentWidth() / width);
}

function getDocxPreviewScale() {
  const fitScale = Math.min(1, getPreviewFitScale(816));
  return fitScale * (state.zoom / 100);
}

function fitRenderedDocxPages(container) {
  const pages = getDocxVisualPages(container);
  if (!pages.length) return;
  const widestPage = pages.reduce((width, page) => Math.max(width, page.offsetWidth || page.getBoundingClientRect().width || 816), 816);
  const scale = Math.min(1, getPreviewFitScale(widestPage)) * (state.zoom / 100);
  container.style.setProperty("--doc-zoom", String(scale));
}

async function renderDocxPreview(doc, token) {
  if (!doc?.arrayBuffer) {
    throw new Error("The original DOCX data is unavailable.");
  }

  els.previewMeta.textContent = "DOCX - Preparing preview";
  els.pageInput.value = "";
  els.pageIndicator.textContent = "Preparing preview";
  els.pageInput.disabled = true;
  els.prevPageButton.disabled = true;
  els.nextPageButton.disabled = true;
  els.documentPreview.innerHTML = `<div class="preview-loading">Rendering Word document...</div>`;

  try {
    await waitForDocxLibraries();
    await renderDocxPrimary(doc, token);
  } catch (previewError) {
    console.warn("Primary DOCX preview failed:", previewError.message);
    if (token !== state.renderToken) return;

    try {
      await renderDocxFallback(doc, token);
    } catch (fallbackError) {
      console.warn("Fallback DOCX preview failed:", fallbackError.message);
      if (token !== state.renderToken) return;
      els.documentPreview.innerHTML = `<div class="empty-preview error-preview">
        <i data-lucide="triangle-alert"></i>
        <h2>Preview unavailable</h2>
        <p>The document text is searchable, but the visual preview could not be displayed.</p>
      </div>`;
      els.pageInput.value = "";
      els.pageIndicator.textContent = "Preview unavailable";
    }
  }
}

async function waitForDocxLibraries(timeout = 10000) {
  if (!window.JSZip) {
    await loadScriptWithFallback(
      ["https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"],
      "jszip-runtime"
    );
  }
  if (!window.docx || typeof window.docx.renderAsync !== "function") {
    await loadScriptWithFallback(
      ["https://cdn.jsdelivr.net/npm/docx-preview@0.3.6/dist/docx-preview.min.js", "https://unpkg.com/docx-preview@0.3.6/dist/docx-preview.min.js"],
      "docx-preview-runtime"
    );
  }
  if (!window.mammoth) {
    await loadScriptWithFallback(
      ["https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js", "https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js"],
      "mammoth-runtime"
    );
  }

  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (window.JSZip && window.docx && typeof window.docx.renderAsync === "function") {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("DOCX preview libraries failed to load. Check that JSZip loads before docx-preview.");
}

async function loadScriptWithFallback(urls, id) {
  let lastError;
  for (const src of urls) {
    try {
      await loadScriptOnce(src, id);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Failed to load ${id}`);
}

function loadScriptOnce(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-runtime-id="${id}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.dataset.runtimeId = id;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function renderDocxPrimary(doc, token) {
  if (!window.JSZip || !window.docx || typeof window.docx.renderAsync !== "function") {
    throw new Error("DOCX preview libraries did not load correctly. Confirm that JSZip loads before docx-preview.");
  }

  const previewBuffer = doc.arrayBuffer.slice(0);
  const previewContainer = document.createElement("div");
  previewContainer.className = "docx-preview-container";
  previewContainer.style.setProperty("--doc-zoom", String(getDocxPreviewScale()));

  els.documentPreview.innerHTML = "";
  els.documentPreview.appendChild(previewContainer);

  await window.docx.renderAsync(previewBuffer, previewContainer, previewContainer, {
    className: "docx",
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: false,
    breakPages: true,
    ignoreLastRenderedPageBreak: false,
    experimental: true,
    trimXmlDeclaration: true,
    useBase64URL: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderComments: false,
    debug: false,
  });

  if (token !== state.renderToken) return;

  previewContainer.querySelectorAll("img, svg").forEach((media) => {
    media.style.maxWidth = "100%";
    media.style.height = "auto";
  });
  fitRenderedDocxPages(previewContainer);

  doc.previewStatus = "ready";
  doc.processingStatus = "ready";
  doc.statusMessage = "Ready";
  els.previewMeta.textContent = "DOCX - Ready";
  updateDocxToolbar(previewContainer, doc);
}

async function renderDocxFallback(doc, token) {
  if (!window.mammoth?.convertToHtml) {
    throw new Error("Mammoth fallback renderer is not available.");
  }

  const fallbackBuffer = doc.arrayBuffer.slice(0);
  const result = await window.mammoth.convertToHtml(
    { arrayBuffer: fallbackBuffer },
    {
      convertImage: window.mammoth.images.imgElement((image) =>
        image.read("base64").then((imageBuffer) => ({
          src: `data:${image.contentType};base64,${imageBuffer}`,
        }))
      ),
    }
  );

  if (token !== state.renderToken) return;

  els.documentPreview.innerHTML = `<div class="docx-preview-container">
    <div class="preview-warning">The exact Word layout could not be reproduced. A formatted fallback preview is shown.</div>
    <div class="mammoth-docx-fallback">${result.value}</div>
  </div>`;
  els.previewMeta.textContent = "DOCX - Ready with fallback preview";
  els.pageInput.value = "1";
  els.pageIndicator.textContent = "Rendered document";
  els.pageInput.disabled = true;
  els.prevPageButton.disabled = true;
  els.nextPageButton.disabled = true;
  doc.previewStatus = "fallback";
}

function updateDocxToolbar(previewContainer, doc) {
  const visualPages = getDocxVisualPages(previewContainer);
  doc.visualPageCount = visualPages.length || null;

  if (doc.visualPageCount) {
    state.previewPageIndex = clamp(state.previewPageIndex, 0, doc.visualPageCount - 1);
    els.pageInput.disabled = false;
    els.pageInput.value = String(state.previewPageIndex + 1);
    els.pageInput.max = String(doc.visualPageCount);
    els.pageIndicator.textContent = `of ${doc.visualPageCount}`;
    els.prevPageButton.disabled = state.previewPageIndex <= 0;
    els.nextPageButton.disabled = state.previewPageIndex >= doc.visualPageCount - 1;
    visualPages[state.previewPageIndex]?.scrollIntoView({ block: "start" });
    els.documentPreview.onscroll = () => updateDocxPageFromScroll(visualPages);
    return;
  }

  els.pageInput.value = "1";
  els.pageIndicator.textContent = "Rendered document";
  els.pageInput.disabled = true;
  els.prevPageButton.disabled = true;
  els.nextPageButton.disabled = true;
}

function getDocxVisualPages(host) {
  return Array.from(host.querySelectorAll(".docx-wrapper > section.docx, .docx-wrapper > section, section.docx")).filter((page) => page.getBoundingClientRect().height > 50);
}

function updateDocxPageFromScroll(pages) {
  const containerTop = els.documentPreview.getBoundingClientRect().top;
  let current = 0;
  pages.forEach((page, index) => {
    if (page.getBoundingClientRect().top - containerTop < 80) {
      current = index;
    }
  });
  state.previewPageIndex = current;
  els.pageInput.value = String(current + 1);
}

function renderMarkdownPreview(doc) {
  const html = window.marked ? window.marked.parse(doc.extractedText || "") : `<pre>${escapeHtml(doc.extractedText || "")}</pre>`;
  els.documentPreview.innerHTML = `<div class="preview-page markdown-page" style="font-size:${state.zoom}%">${html}</div>`;
  els.pageInput.value = "1";
  els.pageIndicator.textContent = "Markdown";
  els.pageInput.disabled = true;
  els.prevPageButton.disabled = true;
  els.nextPageButton.disabled = true;
}

function renderTextPreview(doc) {
  const page = doc.pages[clamp(state.previewSectionIndex, 0, Math.max(0, doc.pages.length - 1))] || doc.pages[0];
  els.documentPreview.innerHTML = `<div class="preview-page text-page" style="font-size:${state.zoom}%"><p>${escapeHtml(page?.text || "")}</p></div>`;
  els.pageInput.value = String((page?.section || 1));
  els.pageInput.max = String(doc.pages.length || 1);
  els.pageIndicator.textContent = `sections ${doc.pages.length || 1}`;
  els.prevPageButton.disabled = state.previewSectionIndex <= 0;
  els.nextPageButton.disabled = state.previewSectionIndex >= doc.pages.length - 1;
}

function renderChat() {
  const status = state.searchStatus ? `<div class="search-status">${escapeHtml(state.searchStatus)}</div>` : "";
  if (!state.chat.length) {
    els.chatLog.innerHTML = `${status}<div class="message system"><strong>Ready for HR research</strong><p>Upload documents and ask a grounded question. Every question searches all successfully processed uploaded documents.</p></div>`;
    return;
  }

  els.chatLog.innerHTML =
    status +
    state.chat
      .map((message, index) => renderMessage(message, index))
      .join("");
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function renderRetrievalDebug() {
  if (!els.retrievalDebugPanel) return;
  if (!isRetrievalDebugEnabled() || !state.retrievalDebug) {
    els.retrievalDebugPanel.hidden = true;
    els.retrievalDebugPanel.innerHTML = "";
    return;
  }

  const debug = state.retrievalDebug;
  els.retrievalDebugPanel.hidden = false;
  els.retrievalDebugPanel.innerHTML = `<div class="retrieval-debug-card">
    <div class="retrieval-debug-header">
      <strong>Retrieval Debug</strong>
      <span>${escapeHtml(String(debug.documentsSearched))} docs searched</span>
    </div>
    <p><b>Request ID:</b> ${escapeHtml(debug.requestId || "None")}</p>
    <p><b>Current question:</b> ${escapeHtml(debug.currentQuestion || debug.question || "None")}</p>
    <p><b>Previous question:</b> ${escapeHtml(debug.previousQuestion || "None")}</p>
    <p><b>Intent:</b> ${escapeHtml(debug.intent || "None")}</p>
    <p><b>Target document:</b> ${escapeHtml(debug.targetDocument || "All uploaded documents")}</p>
    <p><b>Search scope:</b> ${escapeHtml(debug.searchScope || "All ready documents")}</p>
    <p><b>Validation:</b> ${escapeHtml(state.currentValidation ? `${state.currentValidation.valid ? "Valid" : "Rejected"}${state.currentValidation.reason ? ` - ${state.currentValidation.reason}` : ""}` : "Not run yet")}</p>
    <p><b>Stale detection:</b> ${escapeHtml(state.currentValidation?.staleDetected ? "Triggered" : "Not triggered")}</p>
    <p><b>Gemini raw response:</b> ${escapeHtml(state.currentGeminiRawResponse ? "Captured for this request" : "None")}</p>
    <p><b>Expanded query:</b> ${escapeHtml(debug.expandedQuery || "None")}</p>
    <p><b>Protected terms:</b> ${escapeHtml((debug.protectedTerms || []).join(", ") || "None")}</p>
    <div class="debug-list">
      <b>Document scores</b>
      ${(debug.documentMatches || [])
        .slice(0, 6)
        .map((match) => `<div><span>${escapeHtml(match.filename)}</span><strong>${escapeHtml(String(match.score))}</strong><small>${escapeHtml((match.reasons || []).join("; ") || "No local match")}</small></div>`)
        .join("")}
    </div>
    <div class="debug-list">
      <b>Evidence sent</b>
      ${(debug.topChunks || [])
        .slice(0, 6)
        .map((chunk) => `<div><span>${escapeHtml(chunk.filename)} - ${escapeHtml(chunk.location)}</span><strong>${escapeHtml(String(chunk.score))}</strong><small>${escapeHtml(chunk.type)}: ${escapeHtml(chunk.preview || "")}</small></div>`)
        .join("")}
    </div>
    <div class="debug-list">
      <b>Prompt preview</b>
      <div><small>${escapeHtml(shorten(state.currentPrompt || "Prompt not built yet", 900))}</small></div>
    </div>
  </div>`;
}

function isRetrievalDebugEnabled() {
  return new URLSearchParams(window.location.search).get("debug") === "1" || localStorage.getItem("peoplemind_debug") === "1";
}

function renderMessage(message, index) {
  const isAssistant = message.role === "assistant";
  const references = isAssistant ? message.references || [] : [];
  const referenceButton =
    references.length > 0
      ? `<button class="mini-tool reference-action" type="button" data-view-reference="${index}">
          <i data-lucide="file-search"></i>${references.length === 1 ? "View Reference" : `View References (${references.length})`}
        </button>`
      : "";
  const actions = isAssistant
    ? `<div class="answer-actions">
        ${referenceButton}
        <button class="mini-tool" type="button" data-copy="${index}"><i data-lucide="copy"></i>Copy</button>
        ${message.question ? `<button class="mini-tool" type="button" data-regenerate="${index}"><i data-lucide="refresh-cw"></i>Regenerate</button>` : ""}
      </div>`
    : "";

  return `<div class="message ${message.role}">
    <strong>${message.role === "user" ? "You" : "PeopleMind AI"}</strong>
    <div class="message-body">${formatMessageText(message.text, references, index)}</div>
    ${actions}
  </div>`;
}

function formatMessageText(text, references = [], messageIndex = -1) {
  const displayText = normalizeAnswerDisplayText(stripDisplayCitations(text));
  return getDisplayParagraphs(displayText, references)
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => {
      const trimmed = paragraph.trim();
      if (isAnswerSectionTitle(trimmed) && !hasRecommendationContent(trimmed)) {
        return `<h3 class="answer-section-title">${escapeHtml(trimmed)}</h3>`;
      }
      if (isRecommendationParagraph(trimmed)) {
        return renderRecommendationParagraph(trimmed);
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        const items = trimmed
          .split(/\n/)
          .map((line) => line.replace(/^\d+\.\s+/, "").trim())
          .filter(Boolean)
          .map((line, itemIndex) => renderRecommendationItem(line, itemIndex))
          .join("");
        return `<div class="recommendation-list">${items}</div>`;
      }
      if (trimmed.startsWith("- ")) {
        const items = trimmed
          .split(/\n/)
          .map((line) => line.replace(/^- /, "").trim())
          .filter(Boolean)
          .map((line, itemIndex) => renderRecommendationItem(line, itemIndex))
          .join("");
        return `<div class="recommendation-list">${items}</div>`;
      }
      return `<p>${escapeHtml(trimmed)}</p>`;
    })
    .join("");
}

function normalizeAnswerDisplayText(text) {
  return String(text || "")
    .replace(/AI recommendations\s+[â—-]+\s+these suggestions are not stated in the uploaded documents\./gi, AI_RECOMMENDATION_LABEL)
    .replace(/\*\*(.*?)\*\*/g, "**$1**")
    .trim();
}

function isRecommendationParagraph(text) {
  return (
    /AI recommendations|Suggested improvements|Recommendations/i.test(text || "") ||
    countBoldRecommendationTitles(text) >= 2
  );
}

function hasRecommendationContent(text) {
  return countBoldRecommendationTitles(text) > 0 || /\n\s*(?:\d+\.|-)\s+/.test(text || "");
}

function countBoldRecommendationTitles(text) {
  return (String(text || "").match(/\*\*[^*\n:]{3,80}:\*\*/g) || []).length;
}

function renderRecommendationParagraph(text) {
  const introAndItems = splitRecommendationText(text);
  const hasLabel = /AI recommendations|Suggested improvements|Recommendations/i.test(text || "");
  const labelHtml = hasLabel ? `<h3 class="answer-section-title recommendation-title">${AI_RECOMMENDATION_LABEL}</h3>` : "";
  const introHtml = introAndItems.intro
    ? `<p class="recommendation-intro">${escapeHtml(stripMarkdownStars(introAndItems.intro))}</p>`
    : "";
  const itemsHtml = introAndItems.items
    .map((item, index) => renderRecommendationItem(item, index))
    .join("");
  if (!itemsHtml) return `${labelHtml}${introHtml || `<p>${escapeHtml(stripMarkdownStars(text))}</p>`}`;
  return `${labelHtml}<div class="recommendation-block">${introHtml}<div class="recommendation-list">${itemsHtml}</div></div>`;
}

function splitRecommendationText(text) {
  const normalized = String(text || "")
    .replace(new RegExp(escapeRegExp(AI_RECOMMENDATION_LABEL), "i"), "")
    .replace(/^(Suggested improvements|Recommendations)\s*:?\s*/i, "")
    .trim();

  const boldSegments = [];
  const boldPattern = /\*\*([^*\n:]{3,80}):\*\*/g;
  let match;
  let lastIndex = 0;
  let intro = "";
  while ((match = boldPattern.exec(normalized))) {
    if (!boldSegments.length) {
      intro = normalized.slice(0, match.index).trim();
    } else {
      boldSegments[boldSegments.length - 1].body = normalized.slice(lastIndex, match.index).trim();
    }
    boldSegments.push({ title: match[1].trim(), body: "" });
    lastIndex = boldPattern.lastIndex;
  }
  if (boldSegments.length) {
    boldSegments[boldSegments.length - 1].body = normalized.slice(lastIndex).trim();
    return {
      intro,
      items: boldSegments.map((segment) => `${segment.title}: ${segment.body}`.trim()).filter(Boolean),
    };
  }

  const numberedItems = normalized
    .split(/\n/)
    .map((line) => line.replace(/^\d+\.\s+/, "").replace(/^-+\s+/, "").trim())
    .filter(Boolean);
  return { intro: "", items: numberedItems };
}

function renderRecommendationItem(rawItem, index) {
  const item = stripMarkdownStars(rawItem).replace(/^[-\d.]+\s*/, "").trim();
  const parts = splitRecommendationTitle(item);
  return `<article class="recommendation-item">
    <span class="recommendation-number">${index + 1}</span>
    <div>
      <strong>${escapeHtml(parts.title)}</strong>
      ${parts.body ? `<p>${escapeHtml(parts.body)}</p>` : ""}
    </div>
  </article>`;
}

function splitRecommendationTitle(item) {
  const colonMatch = String(item || "").match(/^([^:]{3,72}):\s*(.+)$/);
  if (colonMatch) return { title: colonMatch[1].trim(), body: colonMatch[2].trim() };
  const sentenceMatch = String(item || "").match(/^(.{12,70}?)(?:\s+-\s+|\.\s+)(.+)$/);
  if (sentenceMatch) return { title: sentenceMatch[1].trim(), body: sentenceMatch[2].trim() };
  return { title: item, body: "" };
}

function stripMarkdownStars(text) {
  return String(text || "").replace(/\*\*/g, "").replace(/\*/g, "");
}

function stripDisplayCitations(text) {
  return String(text || "")
    .replace(/\s*\[[^\]]*(?:Page|Section)\s+\d+(?:\.\d+)?[^\]]*\]/gi, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function getDisplayParagraphs(text, references = []) {
  const blocks = String(text || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .flatMap((block) => {
      if (isAnswerSectionTitle(block) || /^[-\d]+\.\s+/.test(block) || block.includes("\n")) return [block];
      if (!references.length || block.length < 300) return [block];
      const sentences = splitSentences(block).filter(Boolean);
      return sentences.length >= 3 ? sentences : [block];
    })
    .join("\n\n");
}

function isAnswerSectionTitle(text) {
  return /^(Document-based answer|Supporting citation|Suggested improvements|AI recommendations|Recommendations)/i.test(text || "");
}

function referenceCitationLabel(reference) {
  const location = reference.pageNumber ? `Page ${reference.pageNumber}` : `Section ${reference.sectionNumber || reference.refValue || 1}`;
  const version = reference.version && reference.version > 1 ? `, Version ${reference.version}` : "";
  return `[${reference.filename}${version}, ${location}]`;
}

function wireEvents() {
  els.pageButtons.forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.pageTarget || "workspace"));
  });
  els.mobilePageSelect?.addEventListener("change", () => showPage(els.mobilePageSelect.value));
  els.dashboardGraphButton?.addEventListener("click", async () => {
    showPage("knowledgeGraph");
    await generateKnowledgeGraph();
  });
  els.dashboardDeckButton?.addEventListener("click", () => {
    showPage("presentationDeck");
    renderPresentationDeck();
  });
  els.clearWorkflowHistoryButton?.addEventListener("click", () => {
    state.workflowHistory = [];
    renderWorkflow();
    renderDashboard();
  });
  els.exportWorkflowLogButton?.addEventListener("click", exportWorkflowLog);
  els.workflowHistoryList?.addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-workflow-detail]");
    if (detailButton) {
      renderWorkflowDetail(detailButton.dataset.workflowDetail);
    }
  });
  els.apiStatusButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const nextHidden = !els.apiKeyPanel?.hidden;
    if (els.apiKeyPanel) els.apiKeyPanel.hidden = nextHidden;
    els.apiStatusButton?.setAttribute("aria-expanded", String(!nextHidden));
    if (!nextHidden) {
      els.apiKeyInput.value = "";
      state.apiReplaceMode = !hasGeminiKey();
      setApiFeedback("", "");
      renderApiStatus();
      if (state.apiReplaceMode) window.setTimeout(() => els.apiKeyInput?.focus(), 0);
    }
  });
  els.apiKeyPanel?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => {
    if (els.apiKeyPanel && !els.apiKeyPanel.hidden) {
      els.apiKeyPanel.hidden = true;
      els.apiStatusButton?.setAttribute("aria-expanded", "false");
    }
  });

  els.fileInput.addEventListener("change", async (event) => {
    await handleFiles(Array.from(event.target.files || []));
    els.fileInput.value = "";
  });

  els.documentList.addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-select]");
    if (selectButton) {
      const docId = selectButton.dataset.select;
      setPreviewDocument(docId);
      return;
    }

    const removeButton = event.target.closest("[data-remove]");
    if (!removeButton) return;
    removeDocument(removeButton.dataset.remove);
  });

  els.chatLog.addEventListener("click", async (event) => {
    const viewReferenceButton = event.target.closest("[data-view-reference]");
    if (viewReferenceButton) {
      await openAnswerReference(Number(viewReferenceButton.dataset.viewReference), 0);
      return;
    }

    const copyButton = event.target.closest("[data-copy]");
    if (copyButton) {
      const message = state.chat[Number(copyButton.dataset.copy)];
      const copyText = message?.role === "assistant" ? stripDisplayCitations(message.text) : message?.text || "";
      await navigator.clipboard?.writeText(copyText);
      return;
    }

    const regenerateButton = event.target.closest("[data-regenerate]");
    if (regenerateButton) {
      const messageIndex = Number(regenerateButton.dataset.regenerate);
      const message = state.chat[messageIndex];
      if (message?.question) {
        await runQuestion(message.question, { pushUser: false, replaceAssistantIndex: messageIndex });
      }
    }
  });

  els.referenceDrawer.addEventListener("click", async (event) => {
    const closeButton = event.target.closest("[data-close-reference]");
    if (closeButton) {
      closeReferenceDrawer();
      return;
    }

    const navButton = event.target.closest("[data-reference-nav]");
    if (navButton) {
      await moveActiveReference(Number(navButton.dataset.referenceNav || "0"));
      return;
    }

    const openButton = event.target.closest("[data-open-current-reference]");
    if (openButton) {
      await reopenActiveReference();
    }
  });

  els.prevPageButton.addEventListener("click", () => movePreviewPage(-1));
  els.nextPageButton.addEventListener("click", () => movePreviewPage(1));
  els.pageInput.addEventListener("change", () => {
    const doc = getPreviewDocument();
    if (!doc) return;
    const value = Math.max(1, Number(els.pageInput.value || "1")) - 1;
    if (doc.type === "pdf" || doc.visualPageCount) {
      state.previewPageIndex = value;
    } else {
      state.previewSectionIndex = value;
    }
    renderPreview();
  });

  els.zoomOutButton.addEventListener("click", () => setZoom(state.zoom - 10));
  els.zoomInButton.addEventListener("click", () => setZoom(state.zoom + 10));
  els.resetZoomButton.addEventListener("click", () => setZoom(100));
  els.fitWidthButton.addEventListener("click", () => setZoom(100));
  els.rotateButton.addEventListener("click", () => {
    state.rotation = (state.rotation + 90) % 360;
    renderPreview();
  });
  els.viewerSearchInput.addEventListener("input", () => highlightViewerSearch(els.viewerSearchInput.value.trim()));
  els.downloadDocumentButton.addEventListener("click", () => downloadPreviewDocument());
  els.fullscreenButton.addEventListener("click", () => els.documentPreview.requestFullscreen?.());
  els.askAboutFileButton?.addEventListener("click", () => {
    const doc = getReadyDocumentById(state.previewDocumentId);
    if (!doc) {
      showToast("Select a ready document first.", "warning");
      return;
    }
    state.searchScope = "current";
    renderSearchScopeControls();
    els.questionInput?.focus();
    showToast(`Questions will now use ${doc.name}.`, "success");
  });
  els.searchAllDocumentsButton?.addEventListener("click", () => {
    state.searchScope = "all";
    renderSearchScopeControls();
    els.questionInput?.focus();
    showToast("Questions will now search all ready documents.", "success");
  });
  els.searchScopeSelect?.addEventListener("change", () => {
    state.searchScope = els.searchScopeSelect.value || "all";
    if (state.searchScope === "selected" && !state.selectedSearchDocumentIds.length) {
      state.selectedSearchDocumentIds = getSearchableDocuments().slice(0, 2).map((doc) => doc.id);
    }
    renderSearchScopeControls();
    refreshIcons();
  });
  els.selectedSearchDocumentsList?.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-search-doc-id]");
    if (!checkbox) return;
    const docId = checkbox.dataset.searchDocId;
    if (checkbox.checked) {
      state.selectedSearchDocumentIds = [...new Set([...state.selectedSearchDocumentIds, docId])];
    } else {
      state.selectedSearchDocumentIds = state.selectedSearchDocumentIds.filter((id) => id !== docId);
    }
    renderSearchScopeControls();
  });
  els.saveKeyButton.addEventListener("click", async () => {
    const value = els.apiKeyInput.value.trim();
    if (value) {
      runtimeGeminiApiKey = value;
      sessionStorage.setItem("peoplemind_gemini_key", value);
      els.apiKeyInput.value = "";
      state.apiReplaceMode = false;
      setApiStatus("testing", {
        model: getSelectedGeminiModel(),
        endpoint: getGeminiEndpoint(getSelectedGeminiModel()),
        safeMessage: "Testing saved Gemini key.",
      });
      renderApiStatus();
      refreshIcons();
      await testGeminiConnection();
    } else {
      setApiFeedback("Paste a Gemini API key before saving.", "warning");
      renderApiStatus();
      refreshIcons();
    }
  });
  els.geminiModelInput?.addEventListener("change", async () => {
    const model = getSelectedGeminiModel();
    if (model) {
      state.geminiModel = model;
      sessionStorage.setItem(GEMINI_MODEL_STORAGE_KEY, model);
      state.lastGeminiEndpoint = getGeminiEndpoint(model);
      if (hasGeminiKey()) {
        await testGeminiConnection();
        return;
      }
      renderApiStatus();
      refreshIcons();
    }
  });
  els.replaceKeyButton?.addEventListener("click", () => {
    state.apiReplaceMode = true;
    els.apiKeyInput.value = "";
    renderApiStatus();
    setApiFeedback("Paste a new key to replace the saved session key.", "");
    refreshIcons();
    window.setTimeout(() => els.apiKeyInput?.focus(), 0);
  });
  els.cancelReplaceKeyButton?.addEventListener("click", () => {
    state.apiReplaceMode = false;
    els.apiKeyInput.value = "";
    renderApiStatus();
    setApiFeedback("", "");
    refreshIcons();
  });
  els.removeKeyButton?.addEventListener("click", () => {
    if (!window.confirm("Remove the Gemini API key from this browser session?")) return;
    runtimeGeminiApiKey = "";
    els.apiKeyInput.value = "";
    sessionStorage.removeItem("peoplemind_gemini_key");
    setApiStatus("no_key");
    state.apiReplaceMode = true;
    renderApiStatus();
    setApiFeedback("API key removed from this browser session.", "warning");
    refreshIcons();
  });
  els.testKeyButton?.addEventListener("click", testGeminiConnection);
  els.testModelButton?.addEventListener("click", testGeminiConnection);
  els.copyDiagnosticButton?.addEventListener("click", copyApiDiagnosticReport);
  els.clearChatButton?.addEventListener("click", clearChat);

  els.clearSessionButton.addEventListener("click", () => {
    closeReferenceDrawer();
    state.documents.forEach(revokeDocumentUrls);
    sessionStorage.removeItem("peoplemind_metadata");
    sessionStorage.removeItem("peoplemind_gemini_key");
    runtimeGeminiApiKey = "";
    setApiStatus("no_key");
    state.apiReplaceMode = true;
    state.documents = [];
    state.chat = [];
    state.questionsAsked = 0;
    state.previewDocumentId = null;
    state.previewPageIndex = 0;
    state.previewSectionIndex = 0;
    state.searchStatus = "";
    state.questionHighlight = null;
    state.searchScope = "all";
    state.selectedSearchDocumentIds = [];
    state.workflow = createWorkflowState();
    state.currentWorkflow = state.workflow;
    state.workflowHistory = [];
    state.currentGraph = createEmptyGraph();
    state.graphSettings = {
      scope: "All Ready Documents",
      category: "All Categories",
      selectedDocumentIds: [],
      nodeType: "All Node Types",
      document: "All Documents",
      relationship: "All Relationships",
      minConfidence: 60,
      hideIsolated: false,
      showLabels: true,
      selectorOpen: false,
      documentSearch: "",
      chipsExpanded: false,
      showExample: false,
    };
    state.graphGeneration = {
      active: false,
      stage: "",
      stageIndex: -1,
    };
    state.selectedGraphItem = null;
    state.cytoscapeInstance?.destroy?.();
    state.cytoscapeInstance = null;
    state.presentationDeck = createEmptyDeck();
    state.currentSlideIndex = 0;
    state.presentationHistory = [];
    state.metrics = {
      graphsGenerated: 0,
      decksGenerated: 0,
      slidesGenerated: 0,
      lastGraphGeneration: null,
      lastPresentationGeneration: null,
    };
    hideFileNameSuggestions();
    renderQuestionHighlight();
    els.apiKeyInput.value = "";
    setApiFeedback("", "");
    renderAll();
  });

  els.exportButton.addEventListener("click", exportNotes);
  els.dashboardExportButton.addEventListener("click", exportNotes);

  els.questionInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await askQuestion();
    }
  });
  els.questionInput.addEventListener("input", () => {
    renderFileNameSuggestions();
    renderQuestionHighlight();
  });
  els.questionInput.addEventListener("scroll", syncQuestionHighlightScroll);
  els.questionInput.addEventListener("blur", () => window.setTimeout(hideFileNameSuggestions, 120));
  els.fileNameSuggestions?.addEventListener("mousedown", (event) => {
    const suggestionButton = event.target.closest("[data-insert-filename]");
    if (!suggestionButton) return;
    event.preventDefault();
    insertSuggestedFilename(suggestionButton.dataset.insertFilename || "");
  });

  els.questionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await askQuestion();
  });
  els.summarizeCurrentButton?.addEventListener("click", () => runCurrentDocumentAction("summarize"));
  els.improveCurrentButton?.addEventListener("click", () => runCurrentDocumentAction("improve"));
  els.risksCurrentButton?.addEventListener("click", () => runCurrentDocumentAction("risks"));
  els.promptLibraryButton?.addEventListener("click", () => {
    if (!els.promptLibraryPanel) return;
    els.promptLibraryPanel.hidden = !els.promptLibraryPanel.hidden;
    refreshIcons();
  });
  els.closePromptLibraryButton?.addEventListener("click", () => {
    if (els.promptLibraryPanel) els.promptLibraryPanel.hidden = true;
  });
  els.promptLibraryList?.addEventListener("click", async (event) => {
    const promptButton = event.target.closest("[data-prompt-index]");
    if (!promptButton) return;
    const prompt = suggestedQuestionPrompts[Number(promptButton.dataset.promptIndex)];
    if (!prompt) return;
    if (els.promptLibraryPanel) els.promptLibraryPanel.hidden = true;
    await runQuestion(prepareSuggestedPrompt(prompt), { pushUser: true });
  });

  wireGraphEvents();
  wirePresentationEvents();
}

function showPage(page) {
  const pages = {
    workspace: els.workspacePage,
    dashboard: els.dashboardPage,
    workflow: els.workflowPage,
    knowledgeGraph: els.knowledgeGraphPage,
    presentationDeck: els.presentationDeckPage,
  };
  const nextPage = pages[page] ? page : "workspace";
  state.currentPage = nextPage;
  Object.entries(pages).forEach(([key, node]) => node?.classList.toggle("active-page", key === nextPage));
  els.pageButtons?.forEach((button) => button.classList.toggle("active", button.dataset.pageTarget === nextPage));
  if (els.mobilePageSelect) els.mobilePageSelect.value = nextPage;
  if (nextPage === "knowledgeGraph") {
    renderGraphSettings();
    renderKnowledgeGraph();
  }
  if (nextPage === "presentationDeck") {
    renderPresentationDeck();
  }
  refreshIcons();
}

async function handleFiles(files) {
  if (!files.length) return;

  const summary = { processed: files.length, added: 0, duplicate: 0, sameName: 0, cancelled: 0 };
  for (const file of files) {
    const originalArrayBuffer = await file.arrayBuffer();
    const quickDuplicate = findProbableDuplicate(file);
    const contentHash = await createFileHash(originalArrayBuffer);
    const exactDuplicate = state.documents.find((doc) => doc.contentHash && doc.contentHash === contentHash);
    if (exactDuplicate || quickDuplicate?.contentHash === contentHash) {
      const existing = exactDuplicate || quickDuplicate;
      summary.duplicate += 1;
      setPreviewDocument(existing.id);
      showToast(`This document is already uploaded: ${existing.name}`, "warning");
      continue;
    }

    const sameNameDoc = findDocumentByUploadedFilename(file.name);
    if (sameNameDoc) {
      summary.sameName += 1;
      const action = chooseSameNameUploadAction(sameNameDoc, file);
      if (action.type === "cancel") {
        summary.cancelled += 1;
        continue;
      }
      if (action.type === "replace" || action.type === "version") {
        await replaceDocumentWithUpload(sameNameDoc, file, originalArrayBuffer, contentHash, action.type);
        setPreviewDocument(sameNameDoc.id);
        summary.added += action.type === "version" ? 0 : 0;
        renderAll();
        continue;
      }
      const doc = createDocumentRecord(file, {
        displayName: action.displayName,
        originalArrayBuffer,
        contentHash,
      });
      state.documents.push(doc);
      if (!state.previewDocumentId) state.previewDocumentId = doc.id;
      renderAll();
      await prepareDocument(doc, file, originalArrayBuffer);
      summary.added += 1;
      renderAll();
      continue;
    }

    const doc = createDocumentRecord(file, { originalArrayBuffer, contentHash });
    state.documents.push(doc);
    if (!state.previewDocumentId) state.previewDocumentId = doc.id;
    renderAll();
    await prepareDocument(doc, file, originalArrayBuffer);
    summary.added += 1;
    renderAll();
  }
  showUploadSummary(summary);
}

async function createFileHash(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer.slice(0));
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeUploadedFilename(filename) {
  return String(filename || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getUploadFingerprint(file) {
  return {
    normalizedName: normalizeUploadedFilename(file.name),
    size: file.size,
    type: file.type || "",
    lastModified: file.lastModified || 0,
  };
}

function uploadFingerprintMatches(a, b) {
  return (
    a?.normalizedName === b?.normalizedName &&
    a?.size === b?.size &&
    a?.type === b?.type &&
    a?.lastModified === b?.lastModified
  );
}

function findProbableDuplicate(file) {
  const fingerprint = getUploadFingerprint(file);
  return state.documents.find((doc) => uploadFingerprintMatches(doc.uploadFingerprint, fingerprint)) || null;
}

function findDocumentByUploadedFilename(filename) {
  const normalized = normalizeUploadedFilename(filename);
  return state.documents.find((doc) => normalizeUploadedFilename(doc.originalFilename || doc.name) === normalized) || null;
}

function chooseSameNameUploadAction(existingDoc, file) {
  const message = `A document with this filename already exists: ${existingDoc.name}\n\nType one option:\nreplace = Replace Existing\nversion = Keep as New Version\nrename = Rename and Upload\ncancel = Cancel`;
  const choice = String(window.prompt(message, "version") || "cancel").trim().toLowerCase();
  if (choice.startsWith("replace")) return { type: "replace" };
  if (choice.startsWith("version")) return { type: "version" };
  if (choice.startsWith("rename")) {
    const renamed = promptForUniqueDisplayName(file.name);
    return renamed ? { type: "rename", displayName: renamed } : { type: "cancel" };
  }
  return { type: "cancel" };
}

function promptForUniqueDisplayName(filename) {
  const extension = filename.includes(".") ? `.${filename.split(".").pop()}` : "";
  const baseName = extension ? filename.slice(0, -extension.length) : filename;
  const proposed = `${baseName} - copy${extension}`;
  const value = String(window.prompt("Enter a unique display name for this upload.", proposed) || "").trim();
  if (!value) return "";
  const unique = ensureUniqueDocumentName(value, filename);
  return unique;
}

function ensureUniqueDocumentName(name, fallbackName = "Document") {
  const extension = name.includes(".") ? `.${name.split(".").pop()}` : fallbackName.includes(".") ? `.${fallbackName.split(".").pop()}` : "";
  const base = extension && name.toLowerCase().endsWith(extension.toLowerCase()) ? name.slice(0, -extension.length) : name;
  let candidate = extension ? `${base}${extension}` : base || fallbackName;
  let count = 2;
  const existing = new Set(state.documents.map((doc) => normalizeUploadedFilename(doc.name)));
  while (existing.has(normalizeUploadedFilename(candidate))) {
    candidate = `${base} ${count}${extension}`;
    count += 1;
  }
  return candidate;
}

async function replaceDocumentWithUpload(doc, file, originalArrayBuffer, contentHash, reason) {
  revokeDocumentUrls(doc);
  const previousVersion = {
    version: doc.version || 1,
    name: doc.name,
    contentHash: doc.contentHash || "",
    createdAt: Date.now(),
    type: reason === "version" ? "previous version" : "replaced version",
  };
  Object.assign(doc, createDocumentRecord(file, {
    id: doc.id,
    displayName: doc.name,
    originalArrayBuffer,
    contentHash,
    version: (doc.version || 1) + 1,
    versionHistory: [...(doc.versionHistory || []), previousVersion, { version: (doc.version || 1) + 1, type: reason, createdAt: Date.now(), contentHash }],
  }));
  await prepareDocument(doc, file, originalArrayBuffer);
}

function showUploadSummary(summary) {
  if (!summary.processed) return;
  const lines = [`${summary.processed} file${summary.processed === 1 ? "" : "s"} processed:`];
  if (summary.added) lines.push(`${summary.added} added`);
  if (summary.duplicate) lines.push(`${summary.duplicate} duplicate skipped`);
  if (summary.sameName) lines.push(`${summary.sameName} existing filename requires review`);
  if (summary.cancelled) lines.push(`${summary.cancelled} cancelled`);
  state.searchStatus = lines.join("\n");
  renderChat();
  showToast(lines.join("\n"), summary.duplicate || summary.sameName ? "warning" : "success");
}

function createDocumentRecord(file, options = {}) {
  const displayName = options.displayName || file.name;
  const extension = displayName.split(".").pop()?.toLowerCase() || file.name.split(".").pop()?.toLowerCase() || "";
  const type = getDocumentType(extension);
  return {
    id: options.id || crypto.randomUUID(),
    file,
    name: displayName,
    originalFilename: file.name,
    extension,
    type,
    typeLabel: extension ? extension.toUpperCase() : "FILE",
    objectUrl: URL.createObjectURL(file),
    arrayBuffer: options.originalArrayBuffer ? options.originalArrayBuffer.slice(0) : null,
    contentHash: options.contentHash || "",
    uploadFingerprint: getUploadFingerprint(file),
    extractedText: "",
    pages: [],
    tableChunks: [],
    specialChunks: [],
    searchChunks: [],
    pageCount: 0,
    visualPageCount: null,
    category: "General HR",
    processingStatus: "reading file",
    statusMessage: "Reading file",
    lastAnalyzedAt: null,
    pdfHandle: null,
    originalHtml: "",
    editableHtml: "",
    isModified: false,
    version: options.version || 1,
    versionHistory: options.versionHistory || [{ version: 1, type: "original", createdAt: Date.now(), contentHash: options.contentHash || "" }],
    changeHistory: [],
    editedBlob: null,
  };
}

function getDocumentType(extension) {
  if (extension === "pdf") return "pdf";
  if (extension === "docx") return "docx";
  if (extension === "md" || extension === "markdown") return "markdown";
  return "text";
}

async function prepareDocument(doc, file, originalArrayBuffer = null) {
  try {
    updateDocumentStatus(doc, "extracting text", "Extracting text");
    const sourceArrayBuffer = originalArrayBuffer || (await file.arrayBuffer());
    doc.arrayBuffer = sourceArrayBuffer.slice(0);
    doc.contentHash = doc.contentHash || (await createFileHash(sourceArrayBuffer));
    doc.uploadFingerprint = getUploadFingerprint(file);

    if (doc.type === "pdf") {
      await preparePdfDocument(doc);
    } else if (doc.type === "docx") {
      await prepareDocxDocument(doc);
    } else {
      await prepareTextDocument(doc);
    }

    updateDocumentStatus(doc, "creating searchable chunks", "Creating searchable chunks");
    doc.category = inferDocumentCategory(doc.name, doc.extractedText);
    doc.searchChunks = createSearchChunks(doc);
    updateDocumentStatus(doc, "ready", "Ready");
  } catch (error) {
    updateDocumentStatus(doc, "failed", error.message || "Document is corrupted or unsupported.");
  }
}

function updateDocumentStatus(doc, status, message) {
  doc.processingStatus = status;
  doc.statusMessage = message;
}

async function preparePdfDocument(doc) {
  if (!window.pdfjsLib) {
    await preparePdfDocumentFallback(doc);
    return;
  }
  updateDocumentStatus(doc, "preparing preview", "Preparing PDF preview");
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(doc.arrayBuffer.slice(0)) }).promise;
  doc.pdfHandle = pdf;
  doc.pageCount = pdf.numPages;
  doc.pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
    doc.pages.push({ page: pageNumber, refType: "Page", refValue: pageNumber, refLabel: `Page ${pageNumber}`, text });
  }

  doc.extractedText = doc.pages.map((page) => page.text).join(" ");
  doc.specialChunks = createSpecialHrChunks(doc);
  if (!doc.extractedText.trim()) {
    doc.statusMessage = "PDF rendered, but no extractable text was found.";
  }
}

async function preparePdfDocumentFallback(doc) {
  updateDocumentStatus(doc, "extracting text", "Extracting PDF text without PDF.js");
  const text = await extractPdfTextFallback(doc.arrayBuffer);
  doc.extractedText = normalizeWhitespace(text);
  if (!doc.extractedText) {
    throw new Error("PDF.js is unavailable and no readable text could be extracted from this PDF.");
  }
  doc.pages = chunkTextToSections(doc.extractedText);
  doc.pageCount = doc.pages.length;
  doc.specialChunks = createSpecialHrChunks(doc);
  doc.previewStatus = "fallback";
  doc.statusMessage = "Ready with text preview";
}

async function extractPdfTextFallback(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer.slice(0));
  const source = bytesToLatin1(bytes);
  const parts = [extractPdfTextOperators(source)];
  const streamTexts = await extractPdfStreamTexts(bytes, source);
  parts.push(...streamTexts);
  return normalizeWhitespace(parts.join(" "));
}

async function extractPdfStreamTexts(bytes, source) {
  const results = [];
  const streamPattern = /stream\r?\n/g;
  let match;
  while ((match = streamPattern.exec(source))) {
    const streamStart = match.index + match[0].length;
    const endIndex = source.indexOf("endstream", streamStart);
    if (endIndex < 0) break;
    let streamEnd = endIndex;
    while (streamEnd > streamStart && (bytes[streamEnd - 1] === 10 || bytes[streamEnd - 1] === 13)) streamEnd -= 1;
    const dictionaryStart = Math.max(0, source.lastIndexOf("<<", match.index));
    const dictionaryText = source.slice(dictionaryStart, match.index);
    const streamBytes = bytes.slice(streamStart, streamEnd);
    const decoded = await decodePdfStream(streamBytes, dictionaryText);
    const text = extractPdfTextOperators(bytesToLatin1(decoded));
    if (text) results.push(text);
    streamPattern.lastIndex = endIndex + "endstream".length;
  }
  return results;
}

async function decodePdfStream(streamBytes, dictionaryText) {
  const filters = getPdfStreamFilters(dictionaryText);
  let current = streamBytes;
  for (const filter of filters) {
    if (filter === "ASCII85Decode" || filter === "A85") {
      current = decodeAscii85(current);
    } else if (filter === "FlateDecode" || filter === "Fl") {
      current = await inflatePdfBytes(current);
    }
  }
  return current;
}

function getPdfStreamFilters(dictionaryText) {
  const filters = [];
  const arrayMatch = dictionaryText.match(/\/Filter\s*\[([^\]]+)\]/i);
  if (arrayMatch) {
    arrayMatch[1].replace(/\/([A-Za-z0-9]+)/g, (_, name) => {
      filters.push(name);
      return "";
    });
    return filters;
  }
  const singleMatch = dictionaryText.match(/\/Filter\s*\/([A-Za-z0-9]+)/i);
  if (singleMatch) filters.push(singleMatch[1]);
  return filters;
}

async function inflatePdfBytes(bytes) {
  if (!window.DecompressionStream) return bytes;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return bytes;
  }
}

function decodeAscii85(bytes) {
  const text = bytesToLatin1(bytes).replace(/\s+/g, "");
  const end = text.indexOf("~>");
  const clean = (end >= 0 ? text.slice(0, end) : text).replace(/^<~/, "");
  const output = [];
  let group = [];
  for (const char of clean) {
    if (char === "z" && group.length === 0) {
      output.push(0, 0, 0, 0);
      continue;
    }
    const code = char.charCodeAt(0);
    if (code < 33 || code > 117) continue;
    group.push(code - 33);
    if (group.length === 5) {
      let value = 0;
      group.forEach((part) => {
        value = value * 85 + part;
      });
      output.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
      group = [];
    }
  }
  if (group.length) {
    const missing = 5 - group.length;
    while (group.length < 5) group.push(84);
    let value = 0;
    group.forEach((part) => {
      value = value * 85 + part;
    });
    const decoded = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
    output.push(...decoded.slice(0, 4 - missing));
  }
  return new Uint8Array(output);
}

function extractPdfTextOperators(content) {
  const pieces = [];
  const literalPattern = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  let match;
  while ((match = literalPattern.exec(content))) {
    pieces.push(decodePdfLiteralString(match[0].replace(/\s*Tj\s*$/, "")));
  }

  const arrayPattern = /\[((?:\\.|[^\]])*)\]\s*TJ/g;
  while ((match = arrayPattern.exec(content))) {
    const strings = match[1].match(/\((?:\\.|[^\\)])*\)/g) || [];
    strings.forEach((value) => pieces.push(decodePdfLiteralString(value)));
  }

  const hexPattern = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  while ((match = hexPattern.exec(content))) {
    pieces.push(decodePdfHexString(match[1]));
  }

  return normalizeWhitespace(pieces.join(" "));
}

function decodePdfLiteralString(value) {
  const body = String(value || "").replace(/^\(/, "").replace(/\)$/, "");
  let result = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== "\\") {
      result += char;
      continue;
    }
    const next = body[++index] || "";
    if (next === "n") result += "\n";
    else if (next === "r") result += "\r";
    else if (next === "t") result += "\t";
    else if (next === "b") result += "\b";
    else if (next === "f") result += "\f";
    else if (/[0-7]/.test(next)) {
      let octal = next;
      for (let count = 0; count < 2 && /[0-7]/.test(body[index + 1] || ""); count += 1) {
        octal += body[++index];
      }
      result += String.fromCharCode(parseInt(octal, 8));
    } else {
      result += next;
    }
  }
  return result;
}

function decodePdfHexString(value) {
  const clean = String(value || "").replace(/\s+/g, "");
  const chars = [];
  for (let index = 0; index < clean.length; index += 2) {
    const byte = parseInt(clean.slice(index, index + 2).padEnd(2, "0"), 16);
    if (Number.isFinite(byte)) chars.push(String.fromCharCode(byte));
  }
  return chars.join("");
}

function bytesToLatin1(bytes) {
  let result = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    result += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return result;
}

async function prepareDocxDocument(doc) {
  if (!window.mammoth) throw new Error("DOCX text extraction failed: Mammoth.js is not available.");
  updateDocumentStatus(doc, "extracting text", "Extracting DOCX text");
  const result = await window.mammoth.extractRawText({ arrayBuffer: doc.arrayBuffer.slice(0) });
  const mammothText = normalizeWhitespace(result.value || "");
  const xmlContent = await extractDocxXmlContent(doc.arrayBuffer);
  doc.tableChunks = xmlContent.tables;
  doc.extractedText = mergeUniqueText([mammothText, xmlContent.fullText]);
  if (!doc.extractedText) {
    throw new Error("DOCX text extraction failed: no searchable text was found.");
  }
  doc.pages = chunkTextToSections(doc.extractedText);
  doc.specialChunks = createSpecialHrChunks(doc);
  doc.tableChunks = doc.tableChunks.map((table) => ({
    ...table,
    refType: "Section",
    refValue: findSectionForText(doc, table.quoteText || table.text),
    refLabel: `Section ${findSectionForText(doc, table.quoteText || table.text)}`,
  }));
  updateDocumentStatus(doc, "preparing preview", "Preparing DOCX visual preview");
}

async function prepareTextDocument(doc) {
  const text = new TextDecoder("utf-8").decode(doc.arrayBuffer);
  doc.extractedText = (text || "").replace(/\s+/g, " ").trim();
  if (!doc.extractedText) throw new Error("No searchable text was found.");
  doc.pages = chunkTextToSections(doc.extractedText);
  doc.specialChunks = createSpecialHrChunks(doc);
}

async function extractDocxXmlContent(arrayBuffer) {
  if (!arrayBuffer) return { fullText: "", tables: [] };

  try {
    if (!window.JSZip) {
      await loadScriptWithFallback(
        ["https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"],
        "jszip-runtime"
      );
    }
    if (!window.JSZip) return { fullText: "", tables: [] };

    const zip = await window.JSZip.loadAsync(arrayBuffer.slice(0));
    const xmlFiles = [
      "word/document.xml",
      ...Object.keys(zip.files).filter((name) => /^word\/(header|footer|footnotes|endnotes)\d*\.xml$/i.test(name)),
    ];
    const blocks = [];
    const tables = [];

    for (const fileName of xmlFiles) {
      const file = zip.file(fileName);
      if (!file) continue;
      const xml = await file.async("text");
      const parsed = new DOMParser().parseFromString(xml, "application/xml");
      const body = firstElementByLocalName(parsed, "body") || parsed.documentElement;
      collectDocxBlocks(body, blocks, tables);
    }

    return {
      fullText: normalizeWhitespace(blocks.join(" ")),
      tables,
    };
  } catch {
    return { fullText: "", tables: [] };
  }
}

function collectDocxBlocks(root, blocks, tables) {
  Array.from(root.children || []).forEach((child) => {
    if (child.localName === "p") {
      const text = xmlTextFromNode(child);
      if (text) blocks.push(text);
      return;
    }

    if (child.localName === "tbl") {
      const table = extractDocxTable(child, tables.length + 1, blocks);
      if (table) {
        tables.push(table);
        blocks.push(table.searchableText);
      }
      return;
    }

    collectDocxBlocks(child, blocks, tables);
  });
}

function extractDocxTable(tableNode, tableIndex, previousBlocks) {
  const rows = childElementsByLocalName(tableNode, "tr")
    .map((row) =>
      childElementsByLocalName(row, "tc")
        .map((cell) => xmlTextFromNode(cell))
        .filter(Boolean)
    )
    .filter((row) => row.length);

  if (!rows.length) return null;

  const headers = rows[0].map(normalizeWhitespace).filter(Boolean);
  const flatText = rows.map((row) => row.join(" | ")).join(" ");
  const quoteText = findRatingKeyText(`${previousBlocks.slice(-3).join(" ")} ${flatText}`) || findRatingKeyText(flatText);
  const hasRatingColumns = countTermsPresent(flatText, ["ns", "s", "vs", "na"]) >= 3;
  const headerText = headers.length ? `Columns: ${headers.join(", ")}.` : "";
  const rowText = rows
    .map((row, rowIndex) => {
      if (rowIndex === 0) return `Header row: ${row.join(", ")}.`;
      return `Row ${rowIndex}: ${row.map((cell, cellIndex) => (headers[cellIndex] ? `${headers[cellIndex]}: ${cell}` : cell)).join("; ")}.`;
    })
    .join(" ");
  const tableLabel = hasRatingColumns
    ? "Interview assessment rating table. It uses the rating options NS, S, VS, and NA."
    : `DOCX table ${tableIndex}.`;
  const text = normalizeWhitespace([quoteText, headerText, rowText].filter(Boolean).join(" "));
  const searchableText = normalizeWhitespace([quoteText, tableLabel, headerText, rowText].filter(Boolean).join(" "));

  return {
    type: "table",
    tableIndex,
    headers,
    rows,
    text,
    searchableText,
    quoteText,
  };
}

function xmlTextFromNode(node) {
  const parts = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current.localName === "t") {
      parts.push(current.textContent || "");
    } else if (current.localName === "tab" || current.localName === "br") {
      parts.push(" ");
    }
  }
  return normalizeWhitespace(parts.join(" "));
}

function firstElementByLocalName(root, localName) {
  return Array.from(root.getElementsByTagName("*")).find((node) => node.localName === localName) || null;
}

function childElementsByLocalName(root, localName) {
  return Array.from(root.children || []).filter((node) => node.localName === localName);
}

function createSpecialHrChunks(doc) {
  const chunks = [];
  const ratingKey = findRatingKeyText(doc.extractedText);
  if (ratingKey) {
    const section = findSectionForText(doc, ratingKey);
    chunks.push({
      refType: doc.type === "pdf" ? "Page" : "Section",
      refValue: section,
      refLabel: `${doc.type === "pdf" ? "Page" : "Section"} ${section}`,
      quoteText: ratingKey,
      chunkType: "rating-key",
      text: normalizeWhitespace(`${ratingKey}. Interview assessment rating key. Evaluation table rating options: NS, S, VS, NA.`),
    });
  }
  return chunks;
}

function findRatingKeyText(text) {
  const clean = normalizeWhitespace(text);
  const match = clean.match(/\bRating\s+Key\b\s*[-–—:]?\s*NS\s*:\s*[^;.]{1,90};?\s*S\s*:\s*[^;.]{1,90};?\s*VS\s*:\s*[^;.]{1,90};?\s*NA\s*:\s*[^;.]{1,90}/i);
  if (match) return normalizeWhitespace(match[0]).replace(/[.;\s]+$/, "");

  const lower = clean.toLowerCase();
  const index = lower.indexOf("rating key");
  if (index < 0) return "";
  const slice = clean.slice(index, index + 360);
  if (countTermsPresent(slice, ["ns", "s", "vs", "na"]) >= 3) {
    const end = slice.search(/\.\s+[A-Z]/);
    return normalizeWhitespace(end > 60 ? slice.slice(0, end + 1) : slice).replace(/[.;\s]+$/, "");
  }
  return "";
}

function findSectionForText(doc, text) {
  const normalizedNeedle = normalizeSearchText(text).slice(0, 80);
  if (!normalizedNeedle) return 1;
  const match = (doc.pages || []).find((page) => normalizeSearchText(page.text).includes(normalizedNeedle));
  return Number(match?.refValue || match?.section || match?.page || 1);
}

function mergeUniqueText(parts) {
  const result = [];
  const seen = new Set();
  parts
    .map(normalizeWhitespace)
    .filter(Boolean)
    .forEach((part) => {
      const key = normalizeSearchText(part).slice(0, 240);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(part);
    });
  return normalizeWhitespace(result.join(" "));
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function chunkTextToSections(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  const chunks = [];
  const size = 1800;
  for (let index = 0; index < clean.length; index += size) {
    const section = chunks.length + 1;
    chunks.push({
      section,
      refType: "Section",
      refValue: section,
      refLabel: `Section ${section}`,
      text: clean.slice(index, index + size),
    });
  }
  return chunks.length ? chunks : [{ section: 1, refType: "Section", refValue: 1, refLabel: "Section 1", text: "No readable text found." }];
}

function createSearchChunks(doc) {
  const pageChunks = doc.pages
    .flatMap((page) => splitIntoPassages(page.text).map((text, index) => ({
      id: `${doc.id}-${page.refLabel}-${index}`,
      docId: doc.id,
      docName: doc.name,
      category: doc.category,
      refType: page.refType,
      refValue: page.refValue,
      refLabel: page.refLabel,
      text,
      quoteText: findRatingKeyText(text) || null,
      chunkType: "text",
    })))
    .filter((chunk) => chunk.text.trim().length > 20);

  const tableChunks = (doc.tableChunks || []).map((table, index) => ({
    id: `${doc.id}-table-${table.tableIndex || index + 1}`,
    docId: doc.id,
    docName: doc.name,
    category: doc.category,
    refType: table.refType || "Section",
    refValue: table.refValue || 1,
    refLabel: table.refLabel || `Section ${table.refValue || 1}`,
    text: table.searchableText || table.text,
    quoteText: table.quoteText || findRatingKeyText(table.text || table.searchableText) || null,
    chunkType: "table",
    tableIndex: table.tableIndex,
    headers: table.headers || [],
  }));

  const specialChunks = (doc.specialChunks || []).map((chunk, index) => ({
    id: `${doc.id}-special-${index + 1}`,
    docId: doc.id,
    docName: doc.name,
    category: doc.category,
    refType: chunk.refType,
    refValue: chunk.refValue,
    refLabel: chunk.refLabel,
    text: chunk.text,
    quoteText: chunk.quoteText,
    chunkType: chunk.chunkType || "special",
  }));

  return uniqueEvidence([...specialChunks, ...tableChunks, ...pageChunks]).filter((chunk) => chunk.text.trim().length > 20);
}

function splitIntoPassages(text) {
  const sentences = splitSentences(text);
  const passages = [];
  let buffer = "";
  sentences.forEach((sentence) => {
    const candidate = `${buffer} ${sentence}`.trim();
    if (candidate.length < 520) {
      buffer = candidate;
    } else {
      if (buffer) passages.push(buffer);
      buffer = sentence.trim();
    }
  });
  if (buffer) passages.push(buffer);
  return passages;
}

function removeDocument(id) {
  const doc = state.documents.find((item) => item.id === id);
  if (doc) revokeDocumentUrls(doc);
  const activeMessage = state.chat[state.activeReference?.messageIndex];
  const activeReference = activeMessage?.references?.[state.activeReference?.referenceIndex];
  if (activeReference?.documentId === id) {
    closeReferenceDrawer();
    showToast("This referenced document was removed from the current session.", "warning");
  } else {
    clearReferenceHighlights();
  }
  state.documents = state.documents.filter((item) => item.id !== id);
  if (state.previewDocumentId === id) {
    state.previewDocumentId = state.documents[0]?.id || null;
    state.previewPageIndex = 0;
    state.previewSectionIndex = 0;
  }
  renderAll();
}

function revokeDocumentUrls(doc) {
  if (doc.objectUrl) {
    URL.revokeObjectURL(doc.objectUrl);
    doc.objectUrl = null;
  }
}

function setPreviewDocument(id) {
  closeReferenceDrawer();
  state.previewDocumentId = id;
  state.previewPageIndex = 0;
  state.previewSectionIndex = 0;
  els.viewerSearchInput.value = "";
  renderAll();
}

async function ensureDocumentHashes() {
  for (const doc of state.documents) {
    if (!doc.contentHash && doc.arrayBuffer) {
      doc.contentHash = await createFileHash(doc.arrayBuffer);
    }
  }
}

async function findAndCleanDuplicateDocuments() {
  await ensureDocumentHashes();
  const byHash = new Map();
  const exactDuplicateGroups = [];
  state.documents.forEach((doc) => {
    if (!doc.contentHash) return;
    const group = byHash.get(doc.contentHash) || [];
    group.push(doc);
    byHash.set(doc.contentHash, group);
  });
  byHash.forEach((group) => {
    if (group.length > 1) exactDuplicateGroups.push(group);
  });

  const byName = new Map();
  state.documents.forEach((doc) => {
    const key = normalizeUploadedFilename(doc.originalFilename || doc.name);
    const group = byName.get(key) || [];
    group.push(doc);
    byName.set(key, group);
  });
  const sameNameGroups = [...byName.values()].filter((group) => group.length > 1);

  if (!exactDuplicateGroups.length && !sameNameGroups.length) {
    showToast("No duplicate documents found.", "success");
    return;
  }

  const duplicateCount = exactDuplicateGroups.reduce((total, group) => total + group.length - 1, 0);
  const sameNameCount = sameNameGroups.reduce((total, group) => total + group.length, 0);
  const message = `Duplicate scan found:\n${duplicateCount} exact duplicate document${duplicateCount === 1 ? "" : "s"}\n${sameNameCount} same-name/version record${sameNameCount === 1 ? "" : "s"}\n\nRemove exact duplicates now? Different-content versions will not be removed.`;
  if (!duplicateCount || !window.confirm(message)) {
    showToast("Duplicate scan completed. No documents were removed.", "warning");
    return;
  }

  const removeIds = new Set();
  exactDuplicateGroups.forEach((group) => {
    const sorted = group.slice().sort((a, b) => (a.versionHistory?.[0]?.createdAt || 0) - (b.versionHistory?.[0]?.createdAt || 0));
    const retained = sorted[0];
    sorted.slice(1).forEach((duplicate) => {
      retained.versionHistory = [...(retained.versionHistory || []), ...(duplicate.versionHistory || [])];
      removeIds.add(duplicate.id);
    });
  });
  state.documents.filter((doc) => removeIds.has(doc.id)).forEach(revokeDocumentUrls);
  state.documents = state.documents.filter((doc) => !removeIds.has(doc.id));
  state.selectedSearchDocumentIds = state.selectedSearchDocumentIds.filter((id) => !removeIds.has(id));
  if (removeIds.has(state.previewDocumentId)) state.previewDocumentId = getSearchableDocuments()[0]?.id || null;
  state.currentGraph.sources = (state.currentGraph.sources || []).filter((source) => !removeIds.has(source.docId));
  renderAll();
  showToast(`${removeIds.size} exact duplicate document${removeIds.size === 1 ? "" : "s"} removed.`, "success");
}

function getPreviewDocument() {
  return state.documents.find((doc) => doc.id === state.previewDocumentId) || state.documents[0] || null;
}

function movePreviewPage(delta) {
  const doc = getPreviewDocument();
  if (!doc) return;
  if (doc.type === "pdf" || doc.visualPageCount) {
    const total = doc.type === "pdf" ? doc.pageCount : doc.visualPageCount || 1;
    state.previewPageIndex = clamp(state.previewPageIndex + delta, 0, Math.max(0, total - 1));
  } else {
    state.previewSectionIndex = clamp(state.previewSectionIndex + delta, 0, Math.max(0, doc.pages.length - 1));
  }
  renderPreview();
}

function setZoom(value) {
  state.zoom = clamp(value, 60, 180);
  renderPreview();
}

function highlightViewerSearch(term) {
  els.documentPreview.querySelectorAll("mark.viewer-hit").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent));
  });
  if (!term || term.length < 2) return;

  const walker = document.createTreeWalker(els.documentPreview, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  const lower = term.toLowerCase();
  textNodes.some((node) => {
    const value = node.textContent;
    const index = value.toLowerCase().indexOf(lower);
    if (index === -1) return false;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + term.length);
    const mark = document.createElement("mark");
    mark.className = "viewer-hit";
    range.surroundContents(mark);
    mark.scrollIntoView({ block: "center" });
    return true;
  });
}

function downloadPreviewDocument() {
  const doc = getPreviewDocument();
  if (!doc?.objectUrl) return;
  const link = document.createElement("a");
  link.href = doc.objectUrl;
  link.download = doc.name;
  link.click();
}

function openSource(docId, refType, refValue) {
  const doc = state.documents.find((item) => item.id === docId);
  if (!doc) return;
  clearReferenceHighlights();
  state.previewDocumentId = docId;
  if (refType === "Page") {
    state.previewPageIndex = Math.max(0, Number(refValue || 1) - 1);
  } else if (refType === "Section") {
    state.previewSectionIndex = Math.max(0, Number(refValue || 1) - 1);
  }
  showPage("workspace");
  renderDocuments();
  renderPreview();
  els.documentPreview.classList.add("source-highlight");
  window.setTimeout(() => els.documentPreview.classList.remove("source-highlight"), 1200);
}

async function openAnswerReference(messageIndex, referenceIndex = 0) {
  const message = state.chat[messageIndex];
  const references = message?.references || [];
  if (!references.length) {
    showToast("No verified reference is attached to this answer.", "warning");
    return;
  }

  const safeIndex = clamp(referenceIndex, 0, references.length - 1);
  const reference = references[safeIndex];
  state.activeReference = { messageIndex, referenceIndex: safeIndex };
  renderReferenceDrawer("Opening reference...");

  const doc = state.documents.find((item) => item.id === reference.documentId);
  if (!doc) {
    const messageText = "This referenced document is no longer available in the current session.";
    updateReferenceStatus(messageText, "warning");
    showToast(messageText, "warning");
    return;
  }

  await openReferenceInDocument(reference, doc);
}

async function openReferenceInDocument(reference, doc = null) {
  const targetDoc = doc || state.documents.find((item) => item.id === reference.documentId);
  if (!targetDoc) {
    const messageText = "This referenced document is no longer available in the current session.";
    updateReferenceStatus(messageText, "warning");
    showToast(messageText, "warning");
    return false;
  }

  clearReferenceHighlights();
  showPage("workspace");
  state.previewDocumentId = targetDoc.id;
  state.previewPageIndex = 0;
  state.previewSectionIndex = 0;
  els.viewerSearchInput.value = "";

  if (reference.pageNumber) {
    state.previewPageIndex = Math.max(0, Number(reference.pageNumber) - 1);
  }
  if (reference.sectionNumber) {
    state.previewSectionIndex = Math.max(0, Number(reference.sectionNumber) - 1);
    if (targetDoc.visualPageCount) {
      state.previewPageIndex = clamp(Number(reference.sectionNumber) - 1, 0, targetDoc.visualPageCount - 1);
    }
  }

  showToast(`Opening ${targetDoc.name}`);
  updateReferenceStatus("Loading document preview...");
  renderDocuments();
  await renderPreview();
  await waitForPreviewPaint();

  const location = referenceLocationLabel(reference);
  showToast(`Navigating to ${location}`);
  updateReferenceStatus("Finding supporting sentence...");
  const highlighted = highlightReference(reference, targetDoc);

  if (highlighted) {
    updateReferenceStatus("Reference highlighted.");
    showToast("Reference highlighted", "success");
  } else {
    const messageText = "Reference location opened, but the exact sentence could not be highlighted.";
    updateReferenceStatus(messageText, "warning");
    showToast(messageText, "warning");
  }

  return highlighted;
}

function renderReferenceDrawer(statusText = "") {
  if (!state.activeReference) {
    els.referenceDrawer.classList.remove("open");
    els.referenceDrawer.setAttribute("aria-hidden", "true");
    els.referenceDrawer.innerHTML = "";
    return;
  }

  const active = getActiveReference();
  if (!active) {
    els.referenceDrawer.classList.remove("open");
    els.referenceDrawer.setAttribute("aria-hidden", "true");
    els.referenceDrawer.innerHTML = "";
    return;
  }

  const { reference, referenceIndex, references } = active;
  const total = references.length;
  const location = referenceLocationLabel(reference);
  const quote = reference.quote || "No exact quote was stored for this reference.";
  const navControls =
    total > 1
      ? `<div class="reference-nav">
          <button class="small-button" type="button" data-reference-nav="-1" ${referenceIndex === 0 ? "disabled" : ""}>
            <i data-lucide="chevron-left"></i>Previous
          </button>
          <button class="small-button" type="button" data-reference-nav="1" ${referenceIndex === total - 1 ? "disabled" : ""}>
            Next<i data-lucide="chevron-right"></i>
          </button>
        </div>`
      : "";

  els.referenceDrawer.innerHTML = `<div class="reference-drawer-card">
    <div class="reference-drawer-header">
      <div>
        <span>Answer Reference</span>
        <strong>${referenceIndex + 1} of ${total}</strong>
      </div>
      <button class="tiny-button" type="button" data-close-reference aria-label="Close reference"><i data-lucide="x"></i></button>
    </div>
    <dl class="reference-details">
      <dt>Document</dt>
      <dd>${escapeHtml(reference.filename)}</dd>
      <dt>Location</dt>
      <dd>${escapeHtml(location)}</dd>
      <dt>Supporting text</dt>
      <dd class="reference-quote">"${escapeHtml(quote)}"</dd>
    </dl>
    <p class="reference-status" data-reference-status>${escapeHtml(statusText)}</p>
    <div class="reference-drawer-actions">
      <button class="small-button" type="button" data-open-current-reference><i data-lucide="file-search"></i>Open in Document</button>
      ${navControls}
    </div>
  </div>`;
  els.referenceDrawer.classList.add("open");
  els.referenceDrawer.setAttribute("aria-hidden", "false");
  refreshIcons();
}

function updateReferenceStatus(text, tone = "") {
  const status = els.referenceDrawer.querySelector("[data-reference-status]");
  if (!status) return;
  status.textContent = text || "";
  status.classList.toggle("warning", tone === "warning");
}

function closeReferenceDrawer() {
  state.activeReference = null;
  clearReferenceHighlights();
  renderReferenceDrawer();
}

async function moveActiveReference(delta) {
  const active = getActiveReference();
  if (!active) return;
  const nextIndex = clamp(active.referenceIndex + delta, 0, active.references.length - 1);
  await openAnswerReference(active.messageIndex, nextIndex);
}

async function reopenActiveReference() {
  const active = getActiveReference();
  if (!active) return;
  await openReferenceInDocument(active.reference);
}

function getActiveReference() {
  const active = state.activeReference;
  if (!active) return null;
  const message = state.chat[active.messageIndex];
  const references = message?.references || [];
  if (!references.length) return null;
  const referenceIndex = clamp(active.referenceIndex, 0, references.length - 1);
  const reference = references[referenceIndex];
  if (!reference) return null;
  return { message, references, reference, referenceIndex, messageIndex: active.messageIndex };
}

function referenceLocationLabel(reference) {
  if (reference.pageNumber) return `Page ${reference.pageNumber}`;
  return `Section ${reference.sectionNumber || reference.refValue || 1}`;
}

function highlightReference(reference, doc) {
  const quote = reference.quote || "";
  if (!quote.trim()) return false;

  if (doc.type === "pdf") {
    const textLayer = els.documentPreview.querySelector(".pdf-text-layer");
    if (!textLayer) return false;
    const matched = highlightQuoteInRoot(textLayer, quote, "reference-highlight pdf-reference-highlight");
    if (matched) textLayer.classList.add("reference-visible");
    return matched;
  }

  const root = getReferenceSearchRoot(reference, doc) || els.documentPreview;
  const matchedInTarget = highlightQuoteInRoot(root, quote, "reference-highlight");
  if (matchedInTarget) return true;
  if (root !== els.documentPreview) {
    return highlightQuoteInRoot(els.documentPreview, quote, "reference-highlight");
  }
  return false;
}

function getReferenceSearchRoot(reference, doc) {
  if (doc.type === "pdf") return els.documentPreview.querySelector(".pdf-text-layer");
  if (doc.type === "text") return els.documentPreview.querySelector(".text-page") || els.documentPreview;
  if (doc.type === "markdown") return els.documentPreview.querySelector(".markdown-page") || els.documentPreview;
  if (doc.type === "docx") {
    const pages = getDocxVisualPages(els.documentPreview);
    if (reference.pageNumber && pages[reference.pageNumber - 1]) return pages[reference.pageNumber - 1];
    return els.documentPreview.querySelector(".docx-preview-container") || els.documentPreview;
  }
  return els.documentPreview;
}

function highlightQuoteInRoot(root, quote, classNames) {
  if (!root) return false;
  const candidates = [...new Set([quote, ...splitSentences(quote).filter((sentence) => sentence.trim().length > 18)])]
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    const index = buildNormalizedNodeIndex(root);
    const match = findNormalizedDomMatch(index, candidate);
    if (match && wrapReferenceMatch(match.map, match.start, match.end, classNames)) {
      const firstHighlight = els.documentPreview.querySelector(".reference-highlight");
      firstHighlight?.scrollIntoView({ block: "center", behavior: "smooth" });
      return true;
    }
  }

  return false;
}

function buildNormalizedNodeIndex(root) {
  const nodes = collectVisibleTextNodes(root);
  const rawEntries = [];
  nodes.forEach((node, nodeIndex) => {
    const value = node.textContent || "";
    for (let offset = 0; offset < value.length; offset += 1) {
      rawEntries.push({ node, nodeIndex, offset, char: value[offset] });
    }
  });

  const text = [];
  const map = [];
  let lastWasSpace = true;
  let skipHyphenWhitespace = false;

  for (let index = 0; index < rawEntries.length; index += 1) {
    const entry = rawEntries[index];
    const char = normalizeReferenceChar(entry.char);
    const nextChar = rawEntries[index + 1] ? normalizeReferenceChar(rawEntries[index + 1].char) : "";

    if (char === "-" && /\s/.test(nextChar)) {
      skipHyphenWhitespace = true;
      continue;
    }
    if (skipHyphenWhitespace && /\s/.test(char)) {
      continue;
    }
    skipHyphenWhitespace = false;

    if (/\s/.test(char)) {
      if (!lastWasSpace) {
        text.push(" ");
        map.push(entry);
        lastWasSpace = true;
      }
      continue;
    }

    text.push(char.toLowerCase());
    map.push(entry);
    lastWasSpace = false;
  }

  return { text: text.join(""), map };
}

function collectVisibleTextNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, noscript, textarea, input, .reference-drawer")) {
        return NodeFilter.FILTER_REJECT;
      }
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function findNormalizedDomMatch(index, quote) {
  const normalizedQuote = normalizeReferenceText(quote);
  if (normalizedQuote.length < 4) return null;

  const directStart = index.text.indexOf(normalizedQuote);
  if (directStart >= 0) {
    return { map: index.map, start: directStart, end: directStart + normalizedQuote.length };
  }

  const compactQuote = normalizedQuote.replace(/\s+/g, "");
  if (compactQuote.length < 4) return null;
  const compact = compactNormalizedIndex(index);
  const compactStart = compact.text.indexOf(compactQuote);
  if (compactStart >= 0) {
    return { map: compact.map, start: compactStart, end: compactStart + compactQuote.length };
  }

  return null;
}

function compactNormalizedIndex(index) {
  const text = [];
  const map = [];
  for (let position = 0; position < index.text.length; position += 1) {
    if (/\s/.test(index.text[position])) continue;
    text.push(index.text[position]);
    map.push(index.map[position]);
  }
  return { text: text.join(""), map };
}

function wrapReferenceMatch(map, start, end, classNames) {
  const entries = map.slice(start, end).filter((entry) => entry?.node?.isConnected);
  if (!entries.length) return false;

  const segments = [];
  entries.forEach((entry) => {
    const last = segments[segments.length - 1];
    const entryEnd = entry.offset + 1;
    if (last && last.node === entry.node && entry.offset <= last.end) {
      last.end = Math.max(last.end, entryEnd);
      return;
    }
    if (last && last.node === entry.node && entry.offset === last.end) {
      last.end = entryEnd;
      return;
    }
    segments.push({ node: entry.node, nodeIndex: entry.nodeIndex, start: entry.offset, end: entryEnd });
  });

  segments
    .sort((a, b) => (a.nodeIndex === b.nodeIndex ? b.start - a.start : b.nodeIndex - a.nodeIndex))
    .forEach((segment) => {
      try {
        const range = document.createRange();
        range.setStart(segment.node, segment.start);
        range.setEnd(segment.node, segment.end);
        const mark = document.createElement("mark");
        mark.className = classNames;
        range.surroundContents(mark);
      } catch {
        // The node may have shifted after a previous range wrap. Other matched
        // segments still give the user a useful visual anchor.
      }
    });

  return Boolean(els.documentPreview.querySelector(".reference-highlight"));
}

function clearReferenceHighlights() {
  if (!els.documentPreview) return;
  els.documentPreview.querySelectorAll("mark.reference-highlight").forEach((mark) => {
    const parent = mark.parentNode;
    mark.replaceWith(document.createTextNode(mark.textContent || ""));
    parent?.normalize();
  });
  els.documentPreview.querySelectorAll(".pdf-reference-highlight").forEach((node) => {
    node.classList.remove("pdf-reference-highlight", "reference-highlight");
  });
  els.documentPreview.querySelectorAll(".pdf-text-layer.reference-visible").forEach((node) => {
    node.classList.remove("reference-visible");
  });
  els.documentPreview.classList.remove("source-highlight");
}

function waitForPreviewPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function normalizeReferenceChar(char) {
  if (char === "\u00a0") return " ";
  if (char === "\u201c" || char === "\u201d") return '"';
  if (char === "\u2018" || char === "\u2019") return "'";
  return char;
}

function showToast(message, tone = "info") {
  console.debug(`[PeopleMind] ${tone}: ${message}`);
}

function normalizeDocumentTitle(value) {
  return normalizeSearchText(value)
    .replace(/\.(docx|pdf|txt|md|html)$/g, "")
    .replace(/\b(opportunities)\b/g, "opportunity")
    .replace(/\b(policies)\b/g, "policy")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getFilenameFragment() {
  const input = els.questionInput;
  if (!input || !state.documents.length) return null;
  const cursor = input.selectionStart ?? input.value.length;
  const beforeCursor = input.value.slice(0, cursor);
  const boundary = Math.max(
    beforeCursor.lastIndexOf("\n"),
    beforeCursor.lastIndexOf("?"),
    beforeCursor.lastIndexOf("."),
    beforeCursor.lastIndexOf(","),
    beforeCursor.lastIndexOf(";"),
    beforeCursor.lastIndexOf(":")
  );
  const tail = beforeCursor.slice(boundary + 1);
  const words = tail.trim().split(/\s+/).filter(Boolean).slice(-6);
  const candidates = [];

  words.forEach((_, index) => {
    const fragment = words.slice(index).join(" ");
    const normalizedFragment = normalizeDocumentTitle(fragment);
    if (normalizedFragment.length < 2) return;
    const start = beforeCursor.lastIndexOf(fragment);
    if (start < 0) return;
    const hasMatch = state.documents.some((doc) => normalizeDocumentTitle(doc.name).includes(normalizedFragment));
    if (hasMatch) candidates.push({ fragment, normalizedFragment, start, cursor });
  });

  return candidates.sort((a, b) => b.normalizedFragment.length - a.normalizedFragment.length)[0] || null;
}

function renderFileNameSuggestions() {
  if (!els.fileNameSuggestions) return;
  const fragmentInfo = getFilenameFragment();
  if (!fragmentInfo || !state.documents.length) {
    hideFileNameSuggestions();
    return;
  }

  const normalizedFragment = normalizeDocumentTitle(fragmentInfo.fragment);
  if (normalizedFragment.length < 2) {
    hideFileNameSuggestions();
    return;
  }

  const matches = state.documents
    .filter((doc) => normalizeDocumentTitle(doc.name).includes(normalizedFragment))
    .slice(0, 5);

  if (!matches.length) {
    hideFileNameSuggestions();
    return;
  }

  els.fileNameSuggestions.hidden = false;
  els.fileNameSuggestions.innerHTML = matches
    .map(
      (doc) =>
        `<button type="button" data-insert-filename="${escapeHtml(doc.name)}" title="${escapeHtml(doc.name)}">
          <i data-lucide="file-text"></i>${escapeHtml(doc.name)}
        </button>`
    )
    .join("");
  refreshIcons();
}

function hideFileNameSuggestions() {
  if (!els.fileNameSuggestions) return;
  els.fileNameSuggestions.hidden = true;
  els.fileNameSuggestions.innerHTML = "";
}

function insertSuggestedFilename(filename) {
  const input = els.questionInput;
  const fragmentInfo = getFilenameFragment();
  if (!input || !fragmentInfo || !filename) return;

  const before = input.value.slice(0, fragmentInfo.start);
  const after = input.value.slice(fragmentInfo.cursor);
  input.value = `${before}${filename}${after}`;

  highlightQuestionInputRange(before.length, before.length + filename.length, { caret: "end" });
  hideFileNameSuggestions();
}

function highlightFilenameInQuestionInput(filename, { insertIfEmpty = false, replaceFilenameOnly = false } = {}) {
  const input = els.questionInput;
  if (!input || !filename) return false;

  if (!input.value.trim() && insertIfEmpty) {
    input.value = filename;
  } else if (replaceFilenameOnly && isQuestionInputOnlyFilename()) {
    input.value = filename;
  }

  const index = input.value.toLowerCase().indexOf(filename.toLowerCase());
  if (index < 0) return false;

  highlightQuestionInputRange(index, index + filename.length, { caret: "end" });
  return true;
}

function highlightQuestionInputRange(start, end, { caret = "end" } = {}) {
  const input = els.questionInput;
  if (!input) return;

  state.questionHighlight = { start, end, text: input.value.slice(start, end) };
  input.focus({ preventScroll: true });
  input.classList.add("filename-selected");

  const caretPosition = caret === "start" ? start : end;
  const applyHighlight = () => {
    input.focus({ preventScroll: true });
    input.setSelectionRange(caretPosition, caretPosition);
    renderQuestionHighlight();
  };

  applyHighlight();
  requestAnimationFrame(applyHighlight);
  window.setTimeout(applyHighlight, 80);
}

function renderQuestionHighlight() {
  const layer = els.questionHighlightLayer;
  const input = els.questionInput;
  if (!layer || !input) return;

  const text = input.value || "";
  let highlight = state.questionHighlight;
  if (highlight?.text && text.slice(highlight.start, highlight.end) !== highlight.text) {
    const nextStart = text.toLowerCase().indexOf(highlight.text.toLowerCase());
    highlight = nextStart >= 0 ? { ...highlight, start: nextStart, end: nextStart + highlight.text.length } : null;
    state.questionHighlight = highlight;
  }

  if (!highlight || highlight.start < 0 || highlight.end <= highlight.start || highlight.end > text.length) {
    state.questionHighlight = null;
    layer.innerHTML = escapeHtml(text) || " ";
    syncQuestionHighlightScroll();
    return;
  }

  const before = text.slice(0, highlight.start);
  const selected = text.slice(highlight.start, highlight.end);
  const after = text.slice(highlight.end);
  layer.innerHTML = `${escapeHtml(before)}<mark>${escapeHtml(selected)}</mark>${escapeHtml(after) || " "}`;
  syncQuestionHighlightScroll();
}

function syncQuestionHighlightScroll() {
  if (!els.questionHighlightLayer || !els.questionInput) return;
  els.questionHighlightLayer.scrollTop = els.questionInput.scrollTop;
  els.questionHighlightLayer.scrollLeft = els.questionInput.scrollLeft;
}

function isQuestionInputOnlyFilename() {
  const value = els.questionInput?.value.trim() || "";
  if (!value) return false;
  return state.documents.some((doc) => normalizeDocumentTitle(doc.name) === normalizeDocumentTitle(value));
}

function finishRequest() {
  state.searchStatus = "";
  state.activeRequestController = null;
  persistMetadata();
}

function beginWorkflowRun(requestId, question) {
  resetWorkflow("Starting workflow");
  state.workflow.requestId = requestId;
  state.workflow.question = question;
  state.workflow.startedAt = performance.now();
  state.workflow.wallStartedAt = Date.now();
  state.workflow.status = "running";
  state.currentWorkflow = state.workflow;
  renderWorkflow();
}

function updateWorkflow(values = {}) {
  if (!state.workflow) resetWorkflow();
  Object.assign(state.workflow, values);
  state.currentWorkflow = state.workflow;
  renderWorkflow();
}

function addWorkflowWarning(message) {
  if (!message) return;
  state.workflow.warnings = [...(state.workflow.warnings || []), message];
  renderWorkflow();
}

function addWorkflowError(message) {
  if (!message) return;
  state.workflow.errors = [...(state.workflow.errors || []), message];
  renderWorkflow();
}

function completeWorkflow(status = "completed") {
  if (!state.workflow) return;
  state.workflow.status = status;
  state.workflow.completedAt = performance.now();
  state.workflow.wallCompletedAt = Date.now();
  state.workflow.durationMs = getWorkflowDuration(state.workflow);
  if (status === "completed") {
    state.workflow.summary = "Completed";
  }
  storeWorkflowHistory();
  renderWorkflow();
  renderDashboard();
}

function storeWorkflowHistory() {
  if (!state.workflow?.requestId) return;
  const safeWorkflow = sanitizeWorkflowForExport(state.workflow);
  state.workflowHistory = [safeWorkflow, ...state.workflowHistory.filter((item) => item.requestId !== safeWorkflow.requestId)].slice(0, 30);
}

function sanitizeWorkflowForExport(workflow) {
  return {
    requestId: workflow.requestId,
    question: workflow.question,
    intent: workflow.intent,
    searchScope: workflow.searchScope,
    targetDocument: workflow.targetDocument,
    documentsSearched: workflow.documentsSearched,
    sectionsChecked: workflow.sectionsChecked,
    evidenceSelected: workflow.evidenceSelected,
    model: workflow.model,
    citationValidation: workflow.citationValidation,
    referencesValidated: workflow.referencesValidated,
    referencesTotal: workflow.referencesTotal,
    status: workflow.status,
    startedAt: workflow.wallStartedAt || Date.now(),
    completedAt: workflow.wallCompletedAt || null,
    durationMs: workflow.durationMs || getWorkflowDuration(workflow),
    documents: (workflow.documents || []).map((doc) => ({ id: doc.id, name: doc.name, category: doc.category, sections: doc.sections })),
    topMatches: (workflow.topMatches || []).slice(0, 8),
    evidencePreviews: (workflow.evidencePreviews || []).slice(0, 8),
    validationResult: workflow.validationResult,
    errors: workflow.errors || [],
    warnings: workflow.warnings || [],
    steps: (workflow.steps || []).map((step) => ({
      id: step.id,
      number: step.number,
      label: step.label,
      detail: step.detail,
      status: step.status,
      durationMs: step.durationMs || 0,
    })),
  };
}


function analyzeResponseIntent(question) {
  const normalized = normalizeSearchText(question);
  const wantsRecommendations =
    /\b(ideas?|improve|improved|improvement|add|recommend|recommendation|suggest|suggestion|better structure|changes?|enhance|upgrade|strengthen)\b/i.test(question) ||
    normalized.includes("how can this be improved") ||
    normalized.includes("what should we add");
  const unclearAssessmentShortcut = /\bwhat\s+(?:is|are)\s+(?:the\s+)?q\b.*\bassessment\b/i.test(question);
  const asksAssessmentContents =
    unclearAssessmentShortcut ||
    /\bwhat\s+(?:is|are|'s)\s+(?:in|inside|included in|contained in)\b.*\bassessment\b/i.test(question) ||
    /\bwhat\s+does\b.*\bassessment\b.*\binclude\b/i.test(question);

  return {
    wantsRecommendations,
    asksAssessmentContents,
    unclearAssessmentShortcut,
    interpretedQuestion: unclearAssessmentShortcut ? "What is included in the assessment?" : question,
  };
}

function buildRetrievalQuestion(question, responseIntent) {
  const additions = [];
  if (responseIntent.unclearAssessmentShortcut || responseIntent.asksAssessmentContents) {
    additions.push("assessment form interview assessment criteria comments rating key rating table candidate evaluation");
  }
  if (responseIntent.wantsRecommendations && (responseIntent.asksAssessmentContents || /\b(assessment|interview|rating|score)\b/i.test(question))) {
    additions.push("assessment form structure scoring rating criteria comments evidence interviewer sign-off review");
  } else if (responseIntent.wantsRecommendations) {
    additions.push("missing information suggested additions improve structure deadline signature consent privacy contact details review");
  }
  return normalizeWhitespace([question, responseIntent.interpretedQuestion, ...additions].join(" "));
}

function ensureResponseCompleteness(question, answer, evidence, responseIntent = analyzeResponseIntent(question)) {
  let completed = answer || "";
  if (responseIntent.unclearAssessmentShortcut && !/interpreted|included|assessment/i.test(completed)) {
    completed = `I interpreted "Q in the assessment" as "what is included in the assessment."\n\n${completed}`.trim();
  }
  if (responseIntent.wantsRecommendations && !hasRecommendationSection(completed)) {
    completed = `${completed.trim()}\n\n${buildRecommendationSection(evidence[0])}`.trim();
  }
  return completed;
}

function hasRecommendationSection(text) {
  return /AI recommendations\s+—\s+these suggestions are not stated in the uploaded documents|Suggested improvements|Recommendations/i.test(text || "");
}

function buildRecommendationSectionLegacy(item) {
  const ideas = getImprovementIdeas(item);
  return `AI recommendations — these suggestions are not stated in the uploaded documents.\n${ideas.map((idea, index) => `${index + 1}. ${idea}`).join("\n")}`;
}

function getImprovementIdeas(item) {
  const evidenceText = normalizeSearchText(`${item?.docName || ""} ${item?.text || ""}`);
  if (/\b(reference request|reference letter|referee|previous employer|reason for leaving|work record|employment dates)\b/.test(evidenceText)) {
    return [
      "Add the referee's full name, position, company, email, and telephone number.",
      "Add a clear deadline for returning the reference.",
      "Ask whether the person is eligible for rehire, where lawful and appropriate.",
      "Add attendance and punctuality questions, where lawful and appropriate.",
      "Add a declaration confirming the information is accurate.",
      "Add referee signature and date fields.",
      "Add a privacy and consent statement.",
      "Add instructions explaining how to securely return the completed reference.",
    ];
  }
  if (/\b(interview|assessment|candidate|rating|criteria|comments|ns|vs)\b/.test(evidenceText)) {
    return assessmentImprovementIdeas;
  }
  return [
    "Clarify the purpose, owner, and intended users of the document.",
    "Add defined approval steps and review responsibilities.",
    "Use consistent headings, numbered sections, and plain language.",
    "Add examples or decision criteria where users may interpret rules differently.",
    "Include a review date, version history, and escalation route.",
    "Require authorized HR review before important employment decisions are made.",
  ];
}

function buildRecommendationSection(item) {
  const ideas = getImprovementIdeas(item);
  return `${AI_RECOMMENDATION_LABEL}\n${ideas.map((idea, index) => `${index + 1}. ${idea}`).join("\n")}`;
}

function buildLocalFallbackForSnapshot(question, evidence, requestSnapshot, responseIntent = analyzeResponseIntent(question), prefix = "") {
  const targetEvidence = requestSnapshot?.targetDocumentId ? evidence.filter((item) => item.docId === requestSnapshot.targetDocumentId) : evidence;
  const primary = targetEvidence[0] || evidence[0];
  if (!primary) return "No supporting evidence was found in the uploaded documents. I cannot answer this from the current files.";

  const quote = bestEvidenceQuote(primary);
  const citation = evidenceCitationLabel(primary);
  const intro = prefix ? `${prefix}\n\n` : "";

  if (responseIntent.wantsRecommendations || /\b(what should i add|should add|tell me what i should add|improve|suggest|recommend|missing)\b/i.test(question)) {
    const factual = requestSnapshot?.targetFilename
      ? `${requestSnapshot.targetFilename} contains the following relevant information: "${quote}" ${citation}.`
      : `The current evidence says: "${quote}" ${citation}.`;
    return ensureResponseCompleteness(question, `${intro}${factual}\n\n${buildRecommendationSection(primary)}`, [primary], responseIntent);
  }

  return ensureResponseCompleteness(question, `${intro}${buildLocalEvidenceAnswer(question, primary, responseIntent)}`, [primary], responseIntent);
}

function validateAnswerForRequest({ answer, references, evidence, requestSnapshot }) {
  const normalizedAnswer = normalizeSearchText(answer);
  const evidenceText = normalizeSearchText(evidence.map((item) => `${item.docName} ${item.text}`).join(" "));
  const evidenceDocNames = new Set(evidence.map((item) => item.docName));
  const reasons = [];

  if (requestSnapshot?.targetDocumentId) {
    const targetDoc = state.documents.find((doc) => doc.id === requestSnapshot.targetDocumentId);
    const targetName = targetDoc?.name || requestSnapshot.targetFilename;
    const mentionedDocs = state.documents.filter((doc) => normalizedAnswer.includes(normalizeSearchText(doc.name)));
    const unrelatedMention = mentionedDocs.find((doc) => doc.id !== requestSnapshot.targetDocumentId && !evidenceDocNames.has(doc.name));
    if (unrelatedMention) {
      reasons.push(`Answer mentioned unrelated document ${unrelatedMention.name}`);
    }
    if (targetName && !normalizedAnswer.includes(normalizeSearchText(targetName)) && evidence.some((item) => item.docId === requestSnapshot.targetDocumentId)) {
      reasons.push(`Answer did not mention target document ${targetName}`);
    }
    if (!/assessment|interview/i.test(targetName || "") && /\b(ns|vs|na|not satisfactory|very satisfactory|interview assessment|evaluation chart)\b/i.test(answer) && !/\b(ns|vs|na|not satisfactory|very satisfactory|interview assessment|evaluation chart)\b/i.test(evidenceText)) {
      reasons.push("Answer repeated assessment-form terms unsupported by current evidence");
    }
  }

  const previousQuestion = normalizeSearchText(state.previousQuestion);
  const currentQuestion = normalizeSearchText(requestSnapshot?.question || "");
  let staleDetected = false;
  if (state.previousAnswer && previousQuestion && previousQuestion !== currentQuestion) {
    const similarity = calculateTextSimilarity(state.previousAnswer, answer);
    if (similarity > 0.8) {
      staleDetected = true;
      reasons.push("Stale answer similarity detected");
    }
  }

  const invalidReference = (references || []).find((reference) => !evidence.some((item) => item.docId === reference.documentId));
  if (invalidReference) {
    reasons.push("Reference was not part of current evidence");
  }

  return { valid: reasons.length === 0, reason: reasons.join("; "), staleDetected, checkedAt: Date.now() };
}

function calculateTextSimilarity(a, b) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (!aTokens.size || !bTokens.size) return 0;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union;
}

function resetTemporaryQuestionState() {
  state.currentEvidence = [];
  state.currentReferences = [];
  state.currentStructuredResponse = null;
  state.currentTargetDocumentId = null;
  state.currentIntent = null;
  state.currentProposedEdit = null;
  state.currentPrompt = "";
  state.currentGeminiRawResponse = "";
  state.currentValidation = null;
  state.currentRequestSnapshot = null;
  state.activeReference = null;
  state.retrievalDebug = null;
  state.searchStatus = "";
}

function createRequestSnapshot({ requestId, question, searchableDocuments, responseIntent }) {
  const scopePlan = classifyQuestionScope(question, searchableDocuments, responseIntent);
  const intent = scopePlan.intentLabel;
  const snapshot = {
    requestId,
    question,
    createdAt: Date.now(),
    documentVersions: searchableDocuments.map((document) => Object.freeze({ id: document.id, version: document.version || 1 })),
    previewDocumentId: state.previewDocumentId,
    workspaceMode: state.mode,
    intent,
    requestedScope: scopePlan.requestedScope,
    targetDocumentId: scopePlan.targetDocumentId,
    targetFilename: scopePlan.targetFilename,
    targetConfidence: scopePlan.targetConfidence,
    searchDocumentIds: scopePlan.searchDocumentIds,
    searchScope: scopePlan.searchScopeLabel,
    previousQuestion: state.previousQuestion || "",
    retrievedEvidence: [],
  };
  return Object.freeze(snapshot);
}

function classifyQuestionScope(question, documents, responseIntent = analyzeResponseIntent(question)) {
  const normalized = normalizeSearchText(question);
  const namedTarget = detectNamedDocument(question, documents);
  const currentTarget = detectCurrentPreviewDocument(question, documents);
  const comparison = /\b(compare|difference|differences|contradiction|contradictions|across|between|duplicate|changed|removed|added)\b/.test(normalized);
  const exactSearch = /\b(which|what)\s+(file|document)\b|\bcontains?\b|\bwhere\b/.test(normalized);
  let requestedScope = state.searchScope || "all";
  let target = namedTarget || null;

  if (comparison) {
    requestedScope = state.searchScope === "selected" ? "selected" : "all";
    target = namedTarget || null;
  } else if (currentTarget) {
    requestedScope = "current";
    target = currentTarget;
  } else if (namedTarget) {
    requestedScope = state.searchScope || "all";
    target = namedTarget;
  }

  let searchDocuments = documents;
  if (requestedScope === "current") {
    const currentDoc = currentTarget?.doc || documents.find((doc) => doc.id === state.previewDocumentId);
    searchDocuments = currentDoc ? [currentDoc] : documents;
    target = target || (currentDoc ? { doc: currentDoc, confidence: 92, reason: "Current preview scope" } : null);
  } else if (requestedScope === "selected") {
    const selected = documents.filter((doc) => state.selectedSearchDocumentIds.includes(doc.id));
    searchDocuments = selected.length ? selected : documents;
  }

  const intent = comparison
    ? "comparison"
    : responseIntent.wantsRecommendations
    ? "recommendation"
    : exactSearch
    ? "exact_search"
    : target
    ? "document_question"
    : "general_question";
  const intentLabel = classifyRequestIntent(question, responseIntent);
  const label =
    requestedScope === "current" && searchDocuments[0]
      ? `Current preview document: ${searchDocuments[0].name}`
      : requestedScope === "selected"
      ? `Selected documents (${searchDocuments.length})`
      : "All ready documents";

  return {
    intent,
    intentLabel,
    requestedScope,
    targetDocumentId: target?.doc?.id || null,
    targetFilename: target?.doc?.name || "",
    targetConfidence: target?.confidence || 0,
    searchDocumentIds: searchDocuments.map((doc) => doc.id),
    searchScopeLabel: label,
  };
}

function getDocumentsForRequestScope(searchableDocuments, requestSnapshot) {
  const ids = new Set(requestSnapshot?.searchDocumentIds || []);
  const scoped = ids.size ? searchableDocuments.filter((doc) => ids.has(doc.id)) : searchableDocuments;
  return scoped.length ? scoped : searchableDocuments;
}

function detectCurrentPreviewDocument(question, documents) {
  if (!refersToCurrentPreviewDocument(question)) return null;
  const previewDoc = documents.find((doc) => doc.id === state.previewDocumentId);
  if (!previewDoc) return null;
  return { doc: previewDoc, confidence: 92, reason: "Current preview document" };
}

function refersToCurrentPreviewDocument(question) {
  const normalized = normalizeSearchText(question);
  return /\b(read|summarize|explain|analyze|review|check)?\s*(this|current|open|opened|preview|selected)\s+(file|document|doc|policy|form)\b/.test(normalized) || /\bthis\s+file\b|\bthis\s+document\b|\bcurrent\s+file\b|\bcurrent\s+document\b/.test(normalized);
}

function classifyRequestIntent(question, responseIntent = analyzeResponseIntent(question)) {
  const normalized = normalizeSearchText(question);
  const intents = [];
  if (/\b(which|what)\s+(file|document)\b|\bcontains?\b|\bwhere\b/.test(normalized)) intents.push("Find document");
  if (/\b(compare|difference|contradict|duplicate|changed|removed|added)\b/.test(normalized)) intents.push("Compare documents");
  if (/\b(summarize|summary|read the file|tell me what it says)\b/.test(normalized)) intents.push("Summarize document");
  if (responseIntent.wantsRecommendations || /\b(what should i add|should add|improve|recommend|suggest|missing|weak)\b/.test(normalized)) intents.push("Recommend improvements");
  if (/\b(add|edit|rewrite|modify|change|insert)\b/.test(normalized) && /\b(document|section|policy|file|content)\b/.test(normalized)) intents.push("Edit document");
  if (extractQuotedPhrases(question).length || normalized.split(" ").length > 8 && /\b(which file|contains|sentence)\b/.test(normalized)) intents.push("Search exact sentence");
  if (!intents.length) intents.push("Ask document question");
  return intents.join(" + ");
}

function detectNamedDocument(question, documents) {
  const normalizedQuestion = normalizeFilename(question);
  const lowerQuestion = String(question || "").toLowerCase();
  const matches = documents
    .map((doc) => {
      const lowerName = doc.name.toLowerCase();
      const normalizedName = normalizeFilename(doc.name);
      let score = 0;
      let reason = "";
      if (lowerQuestion.includes(lowerName)) {
        score = 120;
        reason = "Exact filename";
      } else if (normalizedQuestion.includes(normalizedName)) {
        score = 100;
        reason = "Exact normalized title";
      } else if (normalizedName.length > 5 && (normalizedQuestion.includes(normalizedName.slice(0, Math.min(normalizedName.length, 28))) || normalizedName.includes(normalizedQuestion))) {
        score = 72;
        reason = "Strong partial filename";
      } else {
        const nameTerms = normalizedName.split(" ").filter((term) => term.length > 2);
        const questionTerms = new Set(normalizedQuestion.split(" ").filter((term) => term.length > 2));
        const overlap = nameTerms.filter((term) => questionTerms.has(term));
        if (overlap.length >= Math.min(3, nameTerms.length)) {
          score = 48 + overlap.length * 6;
          reason = "Fuzzy title match";
        }
      }
      return { doc, score, reason };
    })
    .filter((match) => match.score >= 60)
    .sort((a, b) => b.score - a.score);

  return matches[0] ? { doc: matches[0].doc, confidence: matches[0].score, reason: matches[0].reason } : null;
}

function normalizeFilename(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.(docx|pdf|txt|md|markdown|csv|json|html|htm)\b/gi, "")
    .replace(/[-_]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function updateSearchStatus(text) {
  state.searchStatus = text;
  renderAll();
}

async function askQuestion() {
  const question = els.questionInput.value.trim();
  if (!question) return;
  els.questionInput.value = "";
  state.questionHighlight = null;
  renderQuestionHighlight();
  hideFileNameSuggestions();
  await runQuestion(question, { pushUser: true });
}

function clearChat() {
  if (state.activeRequestController) {
    state.activeRequestController.abort();
  }
  closeReferenceDrawer();
  state.chat = [];
  state.searchStatus = "";
  state.previousQuestion = "";
  state.previousAnswer = "";
  state.currentEvidence = [];
  state.currentReferences = [];
  state.currentStructuredResponse = null;
  state.currentGeminiRawResponse = "";
  state.currentValidation = null;
  state.currentRequestSnapshot = null;
  state.activeRequestId = null;
  state.activeRequestController = null;
  resetWorkflow("Ready");
  renderChat();
  renderWorkflow();
  renderDashboard();
}

async function runCurrentDocumentAction(action) {
  const doc = getPreviewDocument();
  if (!doc || doc.processingStatus !== "ready") {
    addSystemMessage("Upload or select a ready document first.");
    return;
  }
  const quotedName = `"${doc.name}"`;
  const prompts = {
    summarize: `Summarize ${quotedName}. Keep it clear and cite the supporting section or page.`,
    improve: `Review ${quotedName}. Give improvement ideas for this document and clearly label AI recommendations.`,
    risks: `Find missing information, unclear wording, risks, or review points in ${quotedName}. Include citations for document-based findings and label AI recommendations separately.`,
  };
  await runQuestion(prompts[action] || prompts.summarize, { pushUser: true });
}

function prepareSuggestedPrompt(prompt) {
  return prompt;
}

async function runQuestion(question, { pushUser, replaceAssistantIndex = null }) {
  if (state.activeRequestController) {
    state.activeRequestController.abort();
    console.debug("Previous request cancelled");
  }
  const requestId = crypto.randomUUID();
  const requestController = new AbortController();
  state.activeRequestId = requestId;
  state.activeRequestController = requestController;
  resetTemporaryQuestionState();
  beginWorkflowRun(requestId, question);
  setWorkflowStep("readRequest", "running", "Reading the current question");
  closeReferenceDrawer();
  const responseIntent = analyzeResponseIntent(question);
  setWorkflowStep("readRequest", "completed", "Question captured");
  setWorkflowStep("classifyIntent", "running", "Detecting request intent");
  const detectedIntent = classifyRequestIntent(question, responseIntent);
  updateWorkflow({ intent: detectedIntent });
  setWorkflowStep("classifyIntent", "completed", detectedIntent);
  const searchableDocuments = getSearchableDocuments();

  if (!searchableDocuments.length) {
    setWorkflowStep("searchScope", "warning", "No ready documents available");
    setWorkflowStep("searchDocs", "skipped", "No documents can be searched");
    setWorkflowStep("rankEvidence", "skipped", "No evidence to rank");
    setWorkflowStep("buildContext", "skipped", "No grounded context available");
    setWorkflowStep("consultGemini", "skipped", "No evidence was available");
    setWorkflowStep("validateCitations", "skipped", "No references to validate");
    setWorkflowStep("finalAnswer", "failed", "Upload searchable documents first");
    updateWorkflow({ status: "failed", citationValidation: "Not run - no documents" });
    completeWorkflow("failed");
    addSystemMessage("No searchable documents are available. Upload a document that can be processed successfully.");
    finishRequest();
    return;
  }

  if (pushUser) {
    state.chat.push({ role: "user", text: question, evidence: [], messageId: crypto.randomUUID(), requestId });
    state.questionsAsked += 1;
  }

  const retrievalQuestion = buildRetrievalQuestion(question, responseIntent);
  state.mode = inferModeFromQuestion(retrievalQuestion);
  const requestSnapshot = createRequestSnapshot({ requestId, question, searchableDocuments, responseIntent });
  state.currentRequestSnapshot = requestSnapshot;
  state.currentTargetDocumentId = requestSnapshot.targetDocumentId;
  state.currentIntent = requestSnapshot.intent;
  const scopedDocuments = getDocumentsForRequestScope(searchableDocuments, requestSnapshot);
  const scopeLabel =
    requestSnapshot.requestedScope === "current" && requestSnapshot.targetFilename
      ? `Searching current preview document: ${requestSnapshot.targetFilename}`
      : requestSnapshot.requestedScope === "selected"
      ? `Searching ${scopedDocuments.length} selected document${scopedDocuments.length === 1 ? "" : "s"}`
      : `Searching all ${scopedDocuments.length} ready document${scopedDocuments.length === 1 ? "" : "s"}`;
  updateWorkflow({
    intent: requestSnapshot.intent,
    searchScope: requestSnapshot.searchScope,
    targetDocument: requestSnapshot.targetFilename || "All uploaded documents",
    documentsSearched: scopedDocuments.length,
    sectionsChecked: scopedDocuments.reduce((total, doc) => total + (doc.searchChunks?.length || doc.pages?.length || 0), 0),
    documents: scopedDocuments.map((doc) => ({ id: doc.id, name: doc.name, category: doc.category, sections: doc.searchChunks?.length || doc.pages?.length || 0 })),
  });
  setWorkflowStep("searchScope", "completed", scopeLabel);
  setWorkflowStep("detectTarget", requestSnapshot.targetFilename ? "completed" : "warning", requestSnapshot.targetFilename ? `Prioritized: ${requestSnapshot.targetFilename}` : "No named file; searching selected scope");

  updateSearchStatus("Reading current question...");
  if (!isCurrentRequest(requestId)) return;
  const targetStatus = requestSnapshot.targetFilename ? ` Target document detected: ${requestSnapshot.targetFilename}.` : "";
  updateSearchStatus(`${scopeLabel}.${targetStatus}`);
  if (!isCurrentRequest(requestId)) return;
  setWorkflowStep("searchDocs", "running", "Scanning ready document sections");
  setWorkflowStep("rankEvidence", "running", "Ranking documents and sections");
  updateSearchStatus("Ranking relevant sections...");

  const retrieval = retrieveRelevantChunks(retrievalQuestion, scopedDocuments, state.mode, requestSnapshot);
  if (!isCurrentRequest(requestId)) return;
  const evidence = retrieval.evidence;
  state.currentEvidence = evidence;
  state.retrievalDebug = retrieval.debug;
  markRecentlyAnalyzed(evidence);
  setWorkflowStep("searchDocs", "completed", `${scopedDocuments.length} document${scopedDocuments.length === 1 ? "" : "s"} searched`);
  setWorkflowStep("rankEvidence", evidence.length ? "completed" : "warning", evidence.length ? `${evidence.length} evidence passage${evidence.length === 1 ? "" : "s"} selected` : "No evidence found");
  updateWorkflow({
    evidenceSelected: evidence.length,
    topMatches: (retrieval.debug?.documentMatches || []).slice(0, 8),
    evidencePreviews: evidence.slice(0, 8).map((item, index) => ({
      sourceId: `SOURCE_${index + 1}`,
      filename: item.docName,
      location: item.refLabel,
      score: item.score,
      quote: shorten(bestEvidenceQuote(item), 240),
    })),
  });
  updateSearchStatus("Preparing current evidence...");

  if (!evidence.length) {
    setWorkflowStep("buildContext", "skipped", "No evidence found in the current documents");
    setWorkflowStep("consultGemini", "skipped", "Skipped because no evidence was found");
    setWorkflowStep("validateCitations", "warning", "No answer to validate");
    setWorkflowStep("finalAnswer", "warning", "No references available");
    updateWorkflow({ citationValidation: "No evidence found", status: "warning" });
    const noEvidenceMessage = {
      role: "assistant",
      text: "No supporting evidence was found in the uploaded documents. I cannot answer this from the current files.",
      evidence: [],
      references: [],
      question,
      messageId: crypto.randomUUID(),
      requestId,
      intent: requestSnapshot.intent,
      targetDocumentId: requestSnapshot.targetDocumentId,
      evidenceSnapshot: [],
    };
    if (Number.isInteger(replaceAssistantIndex) && state.chat[replaceAssistantIndex]?.role === "assistant") {
      state.chat[replaceAssistantIndex] = noEvidenceMessage;
    } else {
      state.chat.push(noEvidenceMessage);
    }
    state.searchStatus = "";
    completeWorkflow("warning");
    finishRequest();
    persistMetadata();
    renderAll();
    return;
  }

  setWorkflowStep("buildContext", "completed", `${evidence.length} source-limited passage${evidence.length === 1 ? "" : "s"} prepared`);
  const apiKey = runtimeGeminiApiKey;
  let answer;
  let references = [];
  const strongLocalMatch = retrieval.bestScore >= STRONG_MATCH_THRESHOLD;

  if (apiKey) {
    try {
      setWorkflowStep("consultGemini", "running", "Consulting Gemini with current evidence");
      updateWorkflow({ model: getSelectedGeminiModel() });
      updateSearchStatus("Consulting Gemini...");
      const geminiResult = await askGemini(question, evidence, apiKey, responseIntent, requestController.signal, requestSnapshot);
      if (!isCurrentRequest(requestId)) return;
      setWorkflowStep("consultGemini", "completed", "Gemini returned a structured answer");
      state.currentStructuredResponse = geminiResult;
      answer = ensureResponseCompleteness(question, cleanAnswerText(geminiResult.answer), evidence, responseIntent);
      references = validateGeminiReferences(geminiResult.references, evidence, question);
      if (strongLocalMatch && (geminiClaimsNoEvidence(answer) || (!references.length && !answerHasInlineCitation(answer)))) {
        answer = buildLocalFallbackForSnapshot(question, evidence, requestSnapshot, responseIntent);
        references = buildDirectReferences(evidence, Math.min(3, evidence.length));
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        console.debug("Previous request cancelled");
        return;
      }
      const fallbackPrefix = getGeminiFallbackPrefix(error);
      setWorkflowStep("consultGemini", "warning", fallbackPrefix);
      addWorkflowWarning(fallbackPrefix);
      updateWorkflow({ model: "Local fallback after Gemini error" });
      answer = strongLocalMatch ? buildLocalFallbackForSnapshot(question, evidence, requestSnapshot, responseIntent, fallbackPrefix) : buildExtractiveAnswer(question, evidence, fallbackPrefix, responseIntent);
      references = buildDirectReferences(evidence, Math.min(3, evidence.length));
    }
  } else {
    setWorkflowStep("consultGemini", "skipped", "No API key; using local document search");
    updateWorkflow({ model: "Local document search fallback" });
    answer = strongLocalMatch
      ? buildLocalFallbackForSnapshot(question, evidence, requestSnapshot, responseIntent)
      : buildExtractiveAnswer(question, evidence, "No Gemini API key is active, so this answer uses local extractive evidence only.", responseIntent);
    references = buildDirectReferences(evidence, 1);
  }

  if (!references.length) {
    references = inferReferencesFromAnswer(answer, evidence);
  }

  updateSearchStatus("Validating current response...");
  setWorkflowStep("validateCitations", "running", "Checking answer against current request");
  const validation = validateAnswerForRequest({ answer, references, evidence, requestSnapshot });
  state.currentValidation = validation;
  if (!validation.valid) {
    answer = buildLocalFallbackForSnapshot(question, evidence, requestSnapshot, responseIntent, "The generated answer did not match the current request, so this answer uses current document evidence only.");
    references = buildDirectReferences(evidence, Math.min(3, evidence.length));
    state.currentValidation = { ...validation, fallbackUsed: true };
    setWorkflowStep("validateCitations", "warning", "Stale or unrelated answer blocked; local fallback used");
    addWorkflowWarning(validation.reason || "Generated answer did not pass validation.");
  } else {
    setWorkflowStep("validateCitations", "completed", "Answer matches current request");
  }
  state.currentReferences = references;
  updateWorkflow({
    citationValidation: validation.valid ? `${references.length} of ${references.length} references verified` : `Warning: ${validation.reason || "fallback used"}`,
    referencesValidated: references.length,
    referencesTotal: references.length,
    validationResult: validation,
  });
  setWorkflowStep("finalAnswer", references.length ? "completed" : "warning", references.length ? `${references.length} reference${references.length === 1 ? "" : "s"} ready` : "No references attached");

  if (!isCurrentRequest(requestId)) return;
  const assistantMessage = {
    role: "assistant",
    text: answer,
    evidence,
    references,
    question,
    messageId: crypto.randomUUID(),
    requestId,
    intent: requestSnapshot.intent,
    targetDocumentId: requestSnapshot.targetDocumentId,
    evidenceSnapshot: evidence.map((item) => ({ id: item.id, docId: item.docId, refLabel: item.refLabel, score: item.score })),
  };
  if (Number.isInteger(replaceAssistantIndex) && state.chat[replaceAssistantIndex]?.role === "assistant") {
    state.chat[replaceAssistantIndex] = assistantMessage;
  } else {
    state.chat.push(assistantMessage);
  }
  state.previousQuestion = question;
  state.previousAnswer = answer;
  state.searchStatus = "Completed";
  state.workflow.summary = "Completed";
  completeWorkflow(validation.valid ? "completed" : "warning");
  state.activeRequestController = null;
  persistMetadata();
  renderAll();
  window.setTimeout(() => {
    if (state.activeRequestId === requestId && state.searchStatus === "Completed") {
      state.searchStatus = "";
      renderChat();
    }
  }, 900);
}

function clearTransientAnswerState() {
  state.searchStatus = "";
  state.activeReference = null;
}

function isCurrentRequest(requestId) {
  return state.activeRequestId === requestId;
}

function retrieveRelevantChunks(question, documents, modeName, requestSnapshot = null) {
  const query = buildRetrievalQuery(question, modeName, requestSnapshot);
  const passages = [];
  const documentMatches = documents
    .map((doc) => scoreDocumentMatch(doc, query))
    .sort((a, b) => b.score - a.score);
  const likelyMatches = documentMatches.filter((match) => match.score > 0);
  const candidateMatches = likelyMatches.length ? likelyMatches : documentMatches;

  candidateMatches.forEach((docMatch) => {
    const doc = docMatch.doc;
    doc.searchChunks.forEach((chunk, index) => {
      const score = scoreChunkMatch(chunk, query, docMatch.score, index);
      if (score > 0) {
        passages.push({ ...chunk, score });
      }
    });

    const fallback = createDocumentFallbackChunk(doc, query, docMatch.score);
    if (fallback) passages.push(fallback);
  });

  const ranked = passages.sort((a, b) => b.score - a.score);
  const targetEvidence = query.targetDocumentId ? ranked.filter((chunk) => chunk.docId === query.targetDocumentId).slice(0, 6) : [];
  const relatedEvidence = query.targetDocumentId ? ranked.filter((chunk) => chunk.docId !== query.targetDocumentId).slice(0, 4) : ranked;
  const evidence = query.targetDocumentId
    ? [...targetEvidence, ...relatedEvidence]
    : query.wantsAllDocuments
    ? documents
        .map((doc) => ranked.find((chunk) => chunk.docId === doc.id) || createDocumentFallbackChunk(doc, query, 0) || doc.searchChunks[0])
        .filter(Boolean)
    : ranked;

  const finalEvidence = uniqueEvidence(evidence)
    .slice(0, 10)
    .map((item) => enrichEvidenceQuote(item, query));
  return {
    evidence: finalEvidence,
    bestScore: Number(finalEvidence[0]?.score || documentMatches[0]?.score || 0),
    debug: {
      question,
      requestId: requestSnapshot?.requestId || "",
      currentQuestion: requestSnapshot?.question || question,
      previousQuestion: requestSnapshot?.previousQuestion || "",
      intent: requestSnapshot?.intent || "",
      targetDocument: requestSnapshot?.targetFilename || "All uploaded documents",
      searchScope: requestSnapshot?.searchScope || "All ready documents",
      expandedQuery: Array.from(query.expandedTerms).join(", "),
      protectedTerms: query.protectedTerms,
      documentsSearched: documents.length,
      documentMatches: documentMatches.map((match) => ({
        filename: match.doc.name,
        score: Math.round(match.score * 10) / 10,
        reasons: match.reasons,
      })),
      topChunks: finalEvidence.map((chunk) => ({
        filename: chunk.docName,
        location: chunk.refLabel,
        score: Math.round(Number(chunk.score || 0) * 10) / 10,
        type: chunk.chunkType || "text",
        preview: shorten(chunk.quoteText || chunk.text, 220),
      })),
    },
  };
}

function buildRetrievalQuery(question, modeName, requestSnapshot = null) {
  const baseTokens = tokenize(`${question} ${modeName}`);
  const expandedTerms = new Set(baseTokens);
  baseTokens.forEach((token) => {
    (queryExpansionMap[token] || []).forEach((term) => tokenize(term).forEach((expanded) => expandedTerms.add(expanded)));
  });

  const protectedInQuery = baseTokens.filter((token) => protectedTerms.has(token));
  const normalizedQuestion = normalizeSearchText(question);
  const ratingIntent =
    protectedInQuery.filter((term) => ["ns", "s", "vs", "na"].includes(term)).length >= 2 ||
    /\b(rating|chart|table|criteria|comments|satisfactory|assessment|score|evaluation)\b/i.test(question);
  if (ratingIntent) {
    ratingExpansionTerms.forEach((term) => tokenize(term).forEach((expanded) => expandedTerms.add(expanded)));
  }

  return {
    original: question,
    normalizedQuestion,
    tokens: new Set(baseTokens),
    expandedTerms,
    protectedTerms: [...new Set(protectedInQuery)],
    quotedPhrases: extractQuotedPhrases(question),
    phrases: ratingIntent ? ratingExpansionTerms : [],
    tableIntent: /\b(chart|table|columns?|criteria|comments|rating|score|assessment|evaluation)\b/i.test(question),
    wantsAllDocuments: /\b(all|every|summary|summarize|compare|policies|documents)\b/i.test(question),
    targetDocumentId: requestSnapshot?.targetDocumentId || null,
    targetFilename: requestSnapshot?.targetFilename || "",
    intent: requestSnapshot?.intent || "",
  };
}

function enrichEvidenceQuote(item, query) {
  const queryQuote = findBestQuoteForQuery(item.text, query);
  const quoteText = shouldPreferQueryQuote(item.quoteText || "", queryQuote, query)
    ? queryQuote
    : item.quoteText || queryQuote || bestSentenceFromChunk(item.text);
  return { ...item, quoteText };
}

function findBestQuoteForQuery(text, query) {
  const source = normalizeWhitespace(text);
  if (!source) return "";

  for (const phrase of query.quotedPhrases || []) {
    const exact = findOriginalSnippet(source, phrase);
    if (exact) return exact;
  }

  const longPhrase = extractLikelySearchPhrase(query.original || "");
  if (longPhrase) {
    const exact = findOriginalSnippet(source, longPhrase);
    if (exact) return exact;
  }

  const sentences = splitSentences(source);
  const queryTerms = Array.from(query.expandedTerms || query.tokens || [])
    .filter((term) => !["where", "which", "what", "file", "document", "section"].includes(term));
  let best = { sentence: "", score: 0 };
  sentences.forEach((sentence) => {
    const normalized = normalizeSearchText(sentence);
    let score = 0;
    queryTerms.forEach((term) => {
      if (containsTerm(normalized, term)) score += protectedTerms.has(term) ? 4 : 1;
    });
    (query.quotedPhrases || []).forEach((phrase) => {
      if (normalized.includes(normalizeSearchText(phrase))) score += 20;
    });
    if (score > best.score) best = { sentence, score };
  });
  return best.score > 0 ? normalizeWhitespace(best.sentence) : "";
}

function extractLikelySearchPhrase(question) {
  const cleaned = normalizeWhitespace(question)
    .replace(/\b(where|which file|what file|which document|what document|find|show me|tell me)\b/gi, " ")
    .replace(/\b(is|has|contains|contain|in which file|in the file|in this file|please|can you)\b/gi, " ")
    .replace(/[?]+$/g, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 5) return "";
  return cleaned;
}

function findOriginalSnippet(source, phrase) {
  const normalizedSource = normalizeSearchText(source);
  const normalizedPhrase = normalizeSearchText(phrase);
  if (normalizedPhrase.length < 8) return "";
  const index = normalizedSource.indexOf(normalizedPhrase);
  if (index < 0) {
    const compactIndex = normalizedSource.replace(/\s+/g, "").indexOf(normalizedPhrase.replace(/\s+/g, ""));
    if (compactIndex < 0) return "";
    return findSentenceContainingTerms(source, tokenize(phrase));
  }
  return findSentenceContainingOffset(source, index) || findSentenceContainingTerms(source, tokenize(phrase));
}

function findSentenceContainingOffset(source, normalizedOffset) {
  const sentences = splitSentences(source);
  const normalizedSentences = [];
  let cursor = 0;
  for (const sentence of sentences) {
    const normalized = normalizeSearchText(sentence);
    const start = normalizeSearchText(source).indexOf(normalized, cursor);
    const end = start + normalized.length;
    normalizedSentences.push({ sentence, start, end });
    cursor = Math.max(cursor, end);
  }
  const match = normalizedSentences.find((entry) => normalizedOffset >= entry.start && normalizedOffset <= entry.end);
  return match ? normalizeWhitespace(match.sentence) : "";
}

function findSentenceContainingTerms(source, terms) {
  const sentences = splitSentences(source);
  return sentences
    .map((sentence) => ({
      sentence,
      score: terms.reduce((sum, term) => sum + (containsTerm(normalizeSearchText(sentence), term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)[0]?.sentence || "";
}

function scoreDocumentMatch(doc, query) {
  const fullText = normalizeSearchText(buildFullDocumentSearchText(doc));
  const normalizedName = normalizeSearchText(doc.name);
  const reasons = [];
  let score = 0;

  if (query.targetDocumentId && doc.id === query.targetDocumentId) {
    score += 150;
    reasons.push(`Named target document: ${query.targetFilename || doc.name}`);
  }

  query.quotedPhrases.forEach((phrase) => {
    if (normalizeSearchText(phrase).length > 3 && fullText.includes(normalizeSearchText(phrase))) {
      score += 20;
      reasons.push(`Exact phrase: ${phrase}`);
    }
  });

  query.phrases.forEach((phrase) => {
    if (fullText.includes(normalizeSearchText(phrase))) {
      const boost = phrase.includes("satisfactory") || phrase === "rating key" ? 8 : 4;
      score += boost;
      reasons.push(`Phrase: ${phrase}`);
    }
  });

  const protectedMatches = query.protectedTerms.filter((term) => containsTerm(fullText, term));
  protectedMatches.forEach((term) => {
    score += protectedWeight(term);
    reasons.push(`Abbreviation: ${term.toUpperCase()}`);
  });
  const ratingMatches = protectedMatches.filter((term) => ["ns", "s", "vs", "na"].includes(term));
  if (ratingMatches.length >= 2) score += 10;
  if (ratingMatches.length >= 3) {
    score += 20;
    reasons.push(`Rating abbreviations together: ${ratingMatches.map((term) => term.toUpperCase()).join(", ")}`);
  }
  if (ratingMatches.length >= 4) score += 8;

  query.expandedTerms.forEach((term) => {
    if (protectedTerms.has(term)) return;
    if (containsTerm(fullText, term)) score += 1.2;
    if (containsTerm(normalizedName, term)) score += 2;
  });

  if (query.tableIntent && (doc.tableChunks || []).length) {
    score += 10;
    reasons.push("Table content indexed");
  }
  if (query.tableIntent && (doc.tableChunks || []).some((table) => countTermsPresent(`${table.headers?.join(" ")} ${table.text}`, ["criteria", "comments", "ns", "s", "vs", "na"]) >= 4)) {
    score += 18;
    reasons.push("Assessment table headers");
  }
  if (findRatingKeyText(doc.extractedText)) {
    score += query.tableIntent ? 12 : 4;
    reasons.push("Rating key found");
  }

  return { doc, score, reasons };
}

function scoreChunkMatch(chunk, query, documentScore, index) {
  const text = normalizeSearchText(`${chunk.text} ${chunk.headers?.join(" ") || ""}`);
  let score = Math.min(documentScore * 0.25, 18);

  if (query.targetDocumentId && chunk.docId === query.targetDocumentId) {
    score += 100;
  }

  query.quotedPhrases.forEach((phrase) => {
    if (text.includes(normalizeSearchText(phrase))) score += 24;
  });

  query.phrases.forEach((phrase) => {
    if (text.includes(normalizeSearchText(phrase))) score += phrase.includes("satisfactory") || phrase === "rating key" ? 10 : 4;
  });

  query.expandedTerms.forEach((term) => {
    if (protectedTerms.has(term)) return;
    if (containsTerm(text, term)) score += 1.5;
  });

  const protectedMatches = query.protectedTerms.filter((term) => containsTerm(text, term));
  protectedMatches.forEach((term) => {
    score += protectedWeight(term);
  });
  const ratingMatches = protectedMatches.filter((term) => ["ns", "s", "vs", "na"].includes(term));
  if (ratingMatches.length >= 2) score += 12;
  if (ratingMatches.length >= 3) score += 24;
  if (ratingMatches.length >= 4) score += 8;

  if (query.tableIntent && chunk.chunkType === "table") score += 14;
  if (query.tableIntent && countTermsPresent(text, ["criteria", "comments", "ns", "s", "vs", "na"]) >= 4) score += 18;
  if (chunk.quoteText && query.tableIntent) score += 12;
  if (index === 0 && query.wantsAllDocuments) score += 1.5;
  return score;
}

function createDocumentFallbackChunk(doc, query, documentScore) {
  if (documentScore <= 0) return null;
  const quoteText = findBestQuoteInDocument(doc, query);
  if (!quoteText) return null;
  const refValue = findSectionForText(doc, quoteText);
  const refType = doc.type === "pdf" ? "Page" : "Section";
  return {
    id: `${doc.id}-full-document-match`,
    docId: doc.id,
    docName: doc.name,
    category: doc.category,
    refType,
    refValue,
    refLabel: `${refType} ${refValue}`,
    text: quoteText,
    quoteText,
    chunkType: "exact-document-match",
    score: documentScore + 16,
  };
}

function findBestQuoteInDocument(doc, query) {
  const ratingKey = findRatingKeyText(doc.extractedText);
  if (ratingKey && (query.tableIntent || query.protectedTerms.some((term) => ["ns", "s", "vs", "na"].includes(term)))) {
    return ratingKey;
  }

  const matchingTable = (doc.tableChunks || []).find((table) => scoreChunkMatch({ ...table, chunkType: "table" }, query, 0, 0) >= 18);
  if (matchingTable) return matchingTable.quoteText || bestSentenceFromChunk(matchingTable.text || matchingTable.searchableText);

  const matchingPage = (doc.pages || [])
    .map((page) => ({ page, score: scoreChunkMatch({ ...page, docId: doc.id, docName: doc.name, chunkType: "text" }, query, 0, 0) }))
    .sort((a, b) => b.score - a.score)[0];
  if (matchingPage?.score > 0) return findBestQuoteForQuery(matchingPage.page.text, query) || bestSentenceFromChunk(matchingPage.page.text);
  return "";
}

function buildFullDocumentSearchText(doc) {
  return normalizeWhitespace([
    doc.name,
    doc.category,
    doc.extractedText,
    ...(doc.tableChunks || []).map((table) => `${table.headers?.join(" ")} ${table.searchableText || table.text}`),
    ...(doc.specialChunks || []).map((chunk) => chunk.text),
  ].join(" "));
}

function extractQuotedPhrases(text) {
  const phrases = [];
  const pattern = /["\u201c\u201d']([^"\u201c\u201d']{4,})["\u201c\u201d']/g;
  let match;
  while ((match = pattern.exec(text))) {
    phrases.push(normalizeWhitespace(match[1]));
  }
  return phrases;
}

function protectedWeight(term) {
  const weights = {
    ns: 4,
    s: 4,
    vs: 5,
    na: 3,
    hr: 2,
    cv: 2,
    jd: 2,
    kpi: 2,
    id: 2,
    it: 2,
  };
  return weights[term] || 2;
}

function countTermsPresent(text, terms) {
  const normalized = normalizeSearchText(text);
  return terms.reduce((count, term) => count + (containsTerm(normalized, term) ? 1 : 0), 0);
}

function containsTerm(normalizedText, term) {
  const escaped = escapeRegExp(String(term || "").toLowerCase());
  if (!escaped) return false;
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(normalizedText);
}

function normalizeSearchText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/-\s+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueEvidence(items) {
  const seen = new Set();
  return items.filter((item) => {
    const normalizedText = normalizeSearchText(item.quoteText || item.text || "").slice(0, 500);
    const key = `${item.docId}-${item.version || 1}-${item.refLabel}-${normalizedText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function askGemini(question, evidence, apiKey, responseIntent = analyzeResponseIntent(question), signal = undefined, requestSnapshot = null) {
  const prompt = buildGeminiPrompt(question, evidence, responseIntent, requestSnapshot);
  state.currentPrompt = prompt;
  const result = await callGemini({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 2200,
      responseMimeType: "application/json",
    },
    signal,
  });
  state.currentGeminiRawResponse = result.text;
  if (state.workflow) state.workflow.model = result.model;
  return parseGeminiStructuredResponse(result.text);
}

function getGeminiFallbackPrefix(error) {
  const status = error?.apiStatus || getGeminiErrorCategory(Number(error?.status || 0));
  const fallbackMap = {
    no_key: "Gemini could not be used because no API key is active. This result was generated using local document retrieval.",
    invalid_key: "Gemini could not be used because the API key was not accepted. This result was generated using local document retrieval.",
    permission_denied: "Gemini could not be used because this key does not have permission to use the Gemini API. This result was generated using local document retrieval.",
    quota_exceeded: "Gemini could not be used because the API quota was exceeded. This result was generated using local document retrieval.",
    invalid_model: "Gemini could not be used because the selected model or request was rejected. This result was generated using local document retrieval.",
    network_error: "Gemini could not be used because the network connection failed. This result was generated using local document retrieval.",
    service_unavailable: "Gemini could not be used because Gemini is temporarily unavailable. This result was generated using local document retrieval.",
  };
  return fallbackMap[status] || "Gemini could not be used for this request. This result was generated using local document retrieval.";
}

function buildGeminiPrompt(question, evidence, responseIntent = analyzeResponseIntent(question), requestSnapshot = null) {
  const evidenceBlock = evidence
    .map(
      (item, index) => `SOURCE_${index + 1}
Document ID: ${item.docId}
Document: ${item.docName}
Version: ${item.version || state.documents.find((doc) => doc.id === item.docId)?.version || 1}
${item.refType}: ${item.refValue}
Evidence:
"${item.text}"`
    )
    .join("\n\n");
  const requestParts = [
    "Document-based answer from uploaded evidence",
    "Supporting citation for document-based facts",
    responseIntent.wantsRecommendations ? "Clearly labelled HR recommendations using general reasoning" : "",
  ]
    .filter(Boolean)
    .join("; ");
  const interpretationLine = responseIntent.interpretedQuestion !== question ? `Reasonable interpretation: ${responseIntent.interpretedQuestion}` : "Reasonable interpretation: use the user's wording as written.";
  const recommendationsInstruction = responseIntent.wantsRecommendations
    ? `The user asks for improvement ideas or suggestions. After the cited document-based answer, include a section titled exactly:
AI recommendations — these suggestions are not stated in the uploaded documents.
In that section, provide practical HR recommendations. Do not attach document citations to these general recommendations unless a recommendation is directly stated in the evidence.`
    : "Do not add general recommendations unless the user asks for ideas, improvements, additions, recommendations, or suggested changes.";
  const safeRecommendationsInstruction = recommendationsInstruction.replace(/AI recommendations[\s\S]*?these suggestions are not stated in the uploaded documents\./, AI_RECOMMENDATION_LABEL);

  return `You are PeopleMind AI, an enterprise HR document intelligence assistant.

CURRENT REQUEST ID:
${requestSnapshot?.requestId || "local-request"}

CURRENT USER QUESTION:
${question}

DETECTED INTENT:
${requestSnapshot?.intent || state.mode}

TARGET DOCUMENT:
${requestSnapshot?.targetFilename || "All uploaded documents"}

IMPORTANT:
You must answer only the CURRENT USER REQUEST shown above. Do not repeat or continue any earlier answer unless the current request explicitly asks for it. Ignore previous document targets, previous rating forms, previous recommendations, and previous evidence.
Do not mention another document unless the current evidence makes it relevant.

Detected HR task: ${state.mode}
${interpretationLine}
Required request parts: ${requestParts}

Use only the CURRENT EVIDENCE below. Search scope: ${requestSnapshot?.searchScope || "All ready documents"}.
If the evidence is insufficient, say so.
Every factual sentence must include citations in this format: [DocumentName, Page N] or [DocumentName, Section N].
Do not invent page numbers. For DOCX, TXT, and Markdown use Section citations unless a verified page exists.
Do not include a separate "Relevant evidence" section. Answer directly.
Mention contradictions if evidence from different documents conflicts.
Complete every part of the user request. If the user asks both "what is in it" and "how can it be improved", answer both.
Use this order whenever applicable:
1. Document-based answer
2. Supporting citation inside that answer
3. AI recommendations section
${safeRecommendationsInstruction}
Return only valid JSON in this exact shape. Do not wrap it in markdown fences:
{
  "answer": "short direct answer with compact inline citations where useful",
  "references": [
    {
      "sourceId": "SOURCE_1",
      "quote": "exact supporting sentence copied from the source evidence"
    }
  ]
}
Keep the answer concise: no more than 6 factual sentences before any recommendation section.
The references array must contain no more than 3 sources directly supporting the final answer, not every searched source.
Each quote must be an exact short excerpt from the source evidence, no more than 240 characters.
Use only SOURCE IDs from the evidence below.
If no evidence supports the answer, return an empty references array and say no supporting evidence was found.
For recruitment analysis, do not use or infer age, gender, nationality, religion, disability, marital status, photograph, or other protected characteristics. Do not approve, reject, rank, or hire candidates. Present only decision support for a qualified HR reviewer and state that final employment decisions must be made by authorized human staff.
Do not claim to provide legal advice or guarantee legal compliance.

CURRENT EVIDENCE:
${evidenceBlock}`;
}

function parseGeminiStructuredResponse(text) {
  const raw = String(text || "").trim();
  const jsonText = stripMarkdownFence(raw);
  const jsonCandidate = extractJsonObjectCandidate(jsonText);
  try {
    const parsed = JSON.parse(jsonCandidate);
    return {
      answer: String(parsed.answer || "").trim() || "No answer returned by Gemini.",
      references: Array.isArray(parsed.references) ? parsed.references : [],
    };
  } catch {
    const recoveredAnswer = extractJsonStringProperty(jsonText, "answer");
    return {
      answer: cleanAnswerText(recoveredAnswer || raw) || "No answer returned by Gemini.",
      references: [],
    };
  }
}

function stripMarkdownFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObjectCandidate(text) {
  const source = stripMarkdownFence(text);
  const start = source.indexOf("{");
  if (start < 0) return source;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  return source.slice(start);
}

function extractJsonStringProperty(text, property) {
  const source = stripMarkdownFence(text);
  const keyMatch = new RegExp(`"${escapeRegExp(property)}"\\s*:\\s*"`, "i").exec(source);
  if (!keyMatch) return "";

  const openingQuoteIndex = keyMatch.index + keyMatch[0].length - 1;
  let escaped = false;
  for (let index = openingQuoteIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      try {
        return JSON.parse(source.slice(openingQuoteIndex, index + 1)).trim();
      } catch {
        return source.slice(openingQuoteIndex + 1, index).trim();
      }
    }
  }

  return "";
}

function validateGeminiReferences(rawReferences, evidence, question = "") {
  if (!Array.isArray(rawReferences)) return [];
  const bySourceId = new Map(evidence.map((item, index) => [`SOURCE_${index + 1}`, item]));
  const query = buildRetrievalQuery(question, state.mode);
  const references = [];
  const seen = new Set();

  rawReferences.forEach((rawReference) => {
    const sourceId = String(rawReference?.sourceId || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");
    const source = bySourceId.get(sourceId);
    if (!source) return;

    const rawQuote = String(rawReference?.quote || "").trim();
    const queryQuote = findBestQuoteForQuery(source.text, query);
    const quote = shouldPreferQueryQuote(rawQuote, queryQuote, query) ? queryQuote : rawQuote;
    const normalizedSource = normalizeReferenceText(source.text);
    const normalizedQuote = normalizeReferenceText(quote);
    if (normalizedQuote && !normalizedSource.includes(normalizedQuote)) return;

    const reference = makeReferenceFromEvidence(source, quote || source.text, sourceId);
    const key = `${reference.documentId}-${reference.version || 1}-${reference.pageNumber || reference.sectionNumber}-${normalizeReferenceText(reference.quote).slice(0, 100)}`;
    if (seen.has(key)) return;
    seen.add(key);
    references.push(reference);
  });

  return references.slice(0, 4);
}

function shouldPreferQueryQuote(rawQuote, queryQuote, query) {
  if (!queryQuote) return false;
  if (!rawQuote) return true;
  const rawScore = quoteQueryOverlap(rawQuote, query);
  const queryScore = quoteQueryOverlap(queryQuote, query);
  return queryScore >= rawScore + 2 || (queryScore > rawScore && queryQuote.length > rawQuote.length);
}

function quoteQueryOverlap(quote, query) {
  const normalized = normalizeSearchText(quote);
  return Array.from(query.tokens || []).reduce((sum, term) => sum + (containsTerm(normalized, term) ? (protectedTerms.has(term) ? 3 : 1) : 0), 0);
}

function buildDirectReferences(evidence, count = 1) {
  const seen = new Set();
  const references = [];
  evidence.forEach((item, index) => {
    if (references.length >= count) return;
    const reference = makeReferenceFromEvidence(item, bestEvidenceQuote(item), `SOURCE_${index + 1}`);
    const key = `${reference.documentId}-${reference.version || 1}-${reference.pageNumber || reference.sectionNumber}-${normalizeReferenceText(reference.quote).slice(0, 100)}`;
    if (seen.has(key)) return;
    seen.add(key);
    references.push(reference);
  });
  return references;
}

function inferReferencesFromAnswer(answer, evidence) {
  const normalizedAnswer = normalizeReferenceText(answer);
  const matches = evidence.filter((item) => normalizedAnswer.includes(normalizeReferenceText(item.docName).slice(0, 24)));
  if (matches.length) return buildDirectReferences(matches, 1);
  return [];
}

function makeReferenceFromEvidence(item, quote, sourceId) {
  const doc = state.documents.find((documentRecord) => documentRecord.id === item.docId);
  const candidateQuote = String(quote || item.quoteText || item.text || "").trim();
  const exactQuote = item.quoteText && !normalizeSearchText(doc?.extractedText || "").includes(normalizeSearchText(candidateQuote))
    ? item.quoteText
    : candidateQuote;
  const sourceText = String(item.text || "");
  const offset = findNormalizedOffset(sourceText, exactQuote);
  return {
    documentId: item.docId,
    filename: item.docName,
    fileType: doc?.type || "unknown",
    pageNumber: item.refType === "Page" ? Number(item.refValue) : null,
    sectionNumber: item.refType === "Section" ? Number(item.refValue) : null,
    quote: exactQuote,
    startOffset: offset.start,
    endOffset: offset.end,
    chunkId: item.id,
    relevanceScore: Number(item.score || 0),
    sourceId,
    refType: item.refType,
    refValue: item.refValue,
    refLabel: item.refLabel,
    version: doc?.version || item.version || 1,
  };
}

function bestEvidenceQuote(item) {
  return item.quoteText || findRatingKeyText(item.text) || bestSentenceFromChunk(item.text);
}

function bestSentenceFromChunk(text) {
  return splitSentences(text)[0]?.trim() || String(text || "").trim();
}

function findNormalizedOffset(sourceText, quote) {
  const directIndex = sourceText.indexOf(quote);
  if (directIndex >= 0) return { start: directIndex, end: directIndex + quote.length };
  const normalizedSource = normalizeReferenceText(sourceText);
  const normalizedQuote = normalizeReferenceText(quote);
  const normalizedIndex = normalizedQuote ? normalizedSource.indexOf(normalizedQuote) : -1;
  if (normalizedIndex < 0) return { start: 0, end: Math.min(sourceText.length, quote.length) };
  return { start: normalizedIndex, end: normalizedIndex + normalizedQuote.length };
}

function normalizeReferenceText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/-\s+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildLocalEvidenceAnswer(question, item, responseIntent = analyzeResponseIntent(question)) {
  const quote = bestEvidenceQuote(item);
  const citation = evidenceCitationLabel(item);
  let answer;
  const assessmentEvidence = /assessment|interview|rating|score/i.test(`${item.docName} ${quote}`) && (countTermsPresent(quote, ["ns", "s", "vs", "na"]) >= 3 || /rating key/i.test(quote));
  if (assessmentEvidence) {
    answer = `The matching assessment information is in ${item.docName}. Supporting text: "${quote}" ${citation}.`;
  } else {
    answer = `The matching information is in ${item.docName}. Supporting text: "${quote}" ${citation}.`;
  }
  return ensureResponseCompleteness(question, answer, [item], responseIntent);
}

function buildExtractiveAnswer(question, evidence, prefix, responseIntent = analyzeResponseIntent(question)) {
  const chunks = evidence.slice(0, 3);
  const lines = chunks.map((item) => `${item.text} ${evidenceCitationLabel(item)}`);
  const recruitmentNote =
    state.mode === "Recruitment Assistant"
      ? "\n\nRecruitment note: This is decision support for a qualified HR reviewer. It does not approve, reject, rank, or hire a candidate. Final employment decisions must be made by authorized human staff."
      : "";
  const complianceNote = state.mode === "HR Compliance Review" ? `\n\n${HR_WARNING}` : "";
  return ensureResponseCompleteness(question, `${prefix}\n\n${lines.join("\n\n")}${recruitmentNote}${complianceNote}`, evidence, responseIntent);
}

function evidenceCitationLabel(item) {
  const version = item.version && item.version > 1 ? `, Version ${item.version}` : "";
  return `[${item.docName}${version}, ${item.refLabel}]`;
}

function cleanAnswerText(text) {
  const stripped = stripMarkdownFence(text);
  const jsonAnswer = extractJsonStringProperty(stripped, "answer");
  if (!jsonAnswer && /^\s*\{[\s\S]*"answer"\s*:/.test(stripped)) {
    return "";
  }
  return String(jsonAnswer || stripped || "")
    .replace(/(?:^|\n)\s*(Relevant evidence|Evidence|Sources)\s*:\s*[\s\S]*$/i, "")
    .trim();
}

function geminiClaimsNoEvidence(answer) {
  return /\b(no supporting evidence|not found|could not find|cannot find|no matching|insufficient evidence|not mentioned)\b/i.test(answer || "");
}

function answerHasInlineCitation(answer) {
  return /\[[^\]]+,\s*(?:Page|Section)\s+\d+(?:\.\d+)?\]/i.test(answer || "");
}

function inferDocumentCategory(fileName, text) {
  const source = `${fileName} ${text}`.toLowerCase();
  const categorySignals = [
    { category: "Recruitment", words: ["cv", "resume", "candidate", "job description", "interview", "recruitment"] },
    { category: "Onboarding", words: ["onboarding", "first week", "new employee", "required documents", "orientation", "induction"] },
    { category: "Training", words: ["training", "learning objective", "certification", "knowledge check", "course"] },
    { category: "Benefits", words: ["benefit", "leave", "medical", "insurance", "annual leave", "allowance"] },
    { category: "Performance", words: ["performance", "review", "appraisal", "goal", "rating"] },
    { category: "Compliance", words: ["compliance", "approval", "audit", "regulation", "procedure", "control"] },
    { category: "Policies", words: ["policy", "handbook", "conduct", "disciplinary", "grievance", "remote work", "byod"] },
  ];
  const match = categorySignals.find((item) => item.words.some((word) => source.includes(word)));
  return match?.category || "General HR";
}

function inferModeFromQuestion(question) {
  const lower = question.toLowerCase();
  const modeSignals = [
    { mode: "Recruitment Assistant", words: ["cv", "resume", "candidate", "job description", "interview", "hire", "recruit"] },
    { mode: "Policy Comparison", words: ["compare", "difference", "changed", "added", "removed", "duplicate", "contradiction", "contradict"] },
    { mode: "Onboarding Assistant", words: ["onboarding", "first week", "new employee", "orientation", "required documents", "induction"] },
    { mode: "Training and Skills Assistant", words: ["training", "skill", "certification", "learning", "knowledge check"] },
    { mode: "HR Compliance Review", words: ["compliance", "gap", "approval", "conflict", "legal", "audit", "review question"] },
    { mode: "Employee Policy Assistant", words: ["policy", "leave", "benefit", "working hour", "remote work", "grievance", "disciplinary", "responsibility", "byod"] },
  ];
  const match = modeSignals.find((item) => item.words.some((word) => lower.includes(word)));
  return match?.mode || "General HR Research";
}

function markRecentlyAnalyzed(evidence) {
  const usedIds = new Set(evidence.map((item) => item.docId));
  if (!usedIds.size) return;
  const stamp = Date.now();
  state.documents = state.documents.map((doc) => (usedIds.has(doc.id) ? { ...doc, lastAnalyzedAt: stamp } : doc));
}

function addSystemMessage(text) {
  state.chat.push({ role: "assistant", text, evidence: [], references: [] });
  persistMetadata();
  renderChat();
  renderDashboard();
  refreshIcons();
}

function wireGraphEvents() {
  els.graphExampleButton?.addEventListener("click", () => {
    state.graphSettings.showExample = !state.graphSettings.showExample;
    renderGraphSettings();
  });
  els.graphScopeSelect?.addEventListener("change", () => {
    state.graphSettings.scope = els.graphScopeSelect.value;
    state.graphSettings.selectorOpen = state.graphSettings.scope === "Choose Specific Documents";
    renderGraphSettings();
  });
  els.graphDocumentSelectorButton?.addEventListener("click", () => {
    state.graphSettings.selectorOpen = !state.graphSettings.selectorOpen;
    renderGraphSettings();
    if (state.graphSettings.selectorOpen) {
      window.setTimeout(() => els.graphDocumentSearchInput?.focus(), 0);
    }
  });
  els.closeGraphDocumentSelector?.addEventListener("click", () => {
    state.graphSettings.selectorOpen = false;
    renderGraphSettings();
  });
  els.graphDocumentSearchInput?.addEventListener("input", () => {
    state.graphSettings.documentSearch = els.graphDocumentSearchInput.value;
    renderGraphDocumentSelector();
  });
  els.graphDocumentDropdown?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      state.graphSettings.selectorOpen = false;
      renderGraphSettings();
      els.graphDocumentSelectorButton?.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!state.graphSettings.selectorOpen || !els.graphDocumentSelector) return;
    if (els.graphDocumentSelector.contains(event.target)) return;
    state.graphSettings.selectorOpen = false;
    renderGraphSettings();
  });
  els.graphDocumentOptions?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-graph-doc-option]");
    if (!option || option.getAttribute("aria-disabled") === "true") return;
    toggleGraphDocumentSelection(option.dataset.graphDocOption);
  });
  els.graphDocumentOptions?.addEventListener("keydown", (event) => {
    const option = event.target.closest("[data-graph-doc-option]");
    if (!option || option.getAttribute("aria-disabled") === "true") return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleGraphDocumentSelection(option.dataset.graphDocOption);
    }
  });
  els.selectAllGraphDocuments?.addEventListener("click", () => {
    state.graphSettings.scope = "Choose Specific Documents";
    state.graphSettings.selectedDocumentIds = getSearchableDocuments().map((doc) => doc.id);
    announceGraphSelection();
    renderGraphSettings();
  });
  els.clearGraphDocuments?.addEventListener("click", () => {
    state.graphSettings.selectedDocumentIds = [];
    announceGraphSelection();
    renderGraphSettings();
  });
  els.graphSelectedChips?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-graph-doc]");
    if (removeButton) {
      state.graphSettings.selectedDocumentIds = state.graphSettings.selectedDocumentIds.filter((id) => id !== removeButton.dataset.removeGraphDoc);
      announceGraphSelection();
      renderGraphSettings();
      return;
    }
    const expandButton = event.target.closest("[data-expand-graph-chips]");
    if (expandButton) {
      state.graphSettings.chipsExpanded = !state.graphSettings.chipsExpanded;
      renderGraphSettings();
    }
  });
  els.graphCategorySelect?.addEventListener("change", () => {
    state.graphSettings.category = els.graphCategorySelect.value;
    renderGraphSettings();
  });
  els.graphSearchInput?.addEventListener("input", applyGraphFilters);
  els.graphNodeTypeFilter?.addEventListener("change", () => {
    state.graphSettings.nodeType = els.graphNodeTypeFilter.value;
    applyGraphFilters();
  });
  els.graphDocumentFilter?.addEventListener("change", () => {
    state.graphSettings.document = els.graphDocumentFilter.value;
    applyGraphFilters();
  });
  els.graphRelationshipFilter?.addEventListener("change", () => {
    state.graphSettings.relationship = els.graphRelationshipFilter.value;
    applyGraphFilters();
  });
  els.graphConfidenceInput?.addEventListener("input", () => {
    state.graphSettings.minConfidence = Number(els.graphConfidenceInput.value || 0);
    if (els.graphConfidenceValue) els.graphConfidenceValue.textContent = `${state.graphSettings.minConfidence}%`;
    applyGraphFilters();
  });
  els.hideIsolatedNodes?.addEventListener("change", () => {
    state.graphSettings.hideIsolated = els.hideIsolatedNodes.checked;
    applyGraphFilters();
  });
  els.toggleGraphLabels?.addEventListener("change", () => {
    state.graphSettings.showLabels = els.toggleGraphLabels.checked;
    applyGraphFilters();
  });
  els.generateGraphButton?.addEventListener("click", generateKnowledgeGraph);
  els.regenerateGraphButton?.addEventListener("click", generateKnowledgeGraph);
  els.clearGraphButton?.addEventListener("click", clearKnowledgeGraph);
  els.graphZoomInButton?.addEventListener("click", () => state.cytoscapeInstance?.zoom(state.cytoscapeInstance.zoom() * 1.15));
  els.graphZoomOutButton?.addEventListener("click", () => state.cytoscapeInstance?.zoom(state.cytoscapeInstance.zoom() * 0.85));
  els.graphFitButton?.addEventListener("click", () => state.cytoscapeInstance?.fit(undefined, 40));
  els.graphResetButton?.addEventListener("click", () => {
    state.selectedGraphItem = null;
    state.cytoscapeInstance?.elements().removeClass("highlighted faded");
    renderGraphDetails();
    state.cytoscapeInstance?.fit(undefined, 40);
  });
  els.graphFullscreenButton?.addEventListener("click", () => els.knowledgeGraphCanvas?.requestFullscreen?.());
  els.graphExportButton?.addEventListener("click", () => downloadJson(serializeGraphForExport(), "peoplemind-hr-knowledge-graph.json"));
  els.graphExportPngButton?.addEventListener("click", exportGraphPng);
  els.graphExportSvgButton?.addEventListener("click", exportGraphSvg);
  els.graphExportNodesCsvButton?.addEventListener("click", () => downloadText(toCsv(state.currentGraph.nodes), "peoplemind-graph-nodes.csv", "text/csv"));
  els.graphExportEdgesCsvButton?.addEventListener("click", () => downloadText(toCsv(state.currentGraph.edges), "peoplemind-graph-relationships.csv", "text/csv"));
  els.graphDetailsPanel?.addEventListener("click", async (event) => {
    const refButton = event.target.closest("[data-graph-reference]");
    if (refButton) await openGraphReference(refButton.dataset.graphReference);
    const askButton = event.target.closest("[data-ask-graph-item]");
    if (askButton) askAboutGraphItem(askButton.dataset.askGraphItem);
    const highlightButton = event.target.closest("[data-highlight-graph-item]");
    if (highlightButton) highlightGraphConnections(highlightButton.dataset.highlightGraphItem);
  });
  els.knowledgeGraphCanvas?.addEventListener("click", (event) => {
    const workspaceButton = event.target.closest("[data-graph-empty-action='workspace']");
    if (workspaceButton) showPage("workspace");
    const learnButton = event.target.closest("[data-graph-empty-action='learn']");
    if (learnButton) {
      state.graphSettings.showExample = true;
      renderGraphSettings();
    }
  });
}

function renderGraphSettings() {
  if (state.graphSettings.selectedDocumentIds.length && state.graphSettings.scope === "All Ready Documents") {
    state.graphSettings.scope = "Choose Specific Documents";
  }
  if (els.graphScopeSelect) els.graphScopeSelect.value = state.graphSettings.scope;
  if (els.graphScopeHelp) els.graphScopeHelp.textContent = graphScopeHelp[state.graphSettings.scope] || graphScopeHelp["All Ready Documents"];
  if (els.graphCategoryBlock) els.graphCategoryBlock.hidden = state.graphSettings.scope !== "Document Category";
  if (els.graphDocumentSelectionBlock) els.graphDocumentSelectionBlock.hidden = state.graphSettings.scope !== "Choose Specific Documents";
  if (els.graphExamplePanel) els.graphExamplePanel.hidden = !state.graphSettings.showExample;
  if (els.graphExampleButton) els.graphExampleButton.innerHTML = `<i data-lucide="sparkles"></i>${state.graphSettings.showExample ? "Hide Example" : "Show Example"}`;
  renderGraphCategoryOptions();
  renderGraphDocumentSelector();
  renderGraphFilterOptions();
  updateGraphGenerateState();
  refreshIcons();
}

function renderGraphCategoryOptions() {
  if (!els.graphCategorySelect) return;
  const readyDocs = getSearchableDocuments();
  const options = graphCategoryOptions.map((category) => {
    const count = getDocumentsForGraphCategory(category.label, readyDocs).length;
    const disabled = category.label !== "All Categories" && count === 0;
    return `<option value="${escapeHtml(category.label)}"${category.label === state.graphSettings.category ? " selected" : ""}${disabled ? " disabled" : ""}>
      ${escapeHtml(category.label)} - ${count} document${count === 1 ? "" : "s"}
    </option>`;
  });
  els.graphCategorySelect.innerHTML = options.join("");
  if (!Array.from(els.graphCategorySelect.options).some((option) => option.value === state.graphSettings.category && !option.disabled)) {
    state.graphSettings.category = "All Categories";
    els.graphCategorySelect.value = state.graphSettings.category;
  }
}

function renderGraphDocumentSelector() {
  if (!els.graphDocumentSelectorButton) return;
  const allDocs = state.documents;
  const readyDocs = getSearchableDocuments();
  const readyIds = new Set(readyDocs.map((doc) => doc.id));
  state.graphSettings.selectedDocumentIds = state.graphSettings.selectedDocumentIds.filter((id) => readyIds.has(id));
  const selectedDocs = readyDocs.filter((doc) => state.graphSettings.selectedDocumentIds.includes(doc.id));
  const selectedCountText = `${selectedDocs.length} document${selectedDocs.length === 1 ? "" : "s"} selected`;
  if (els.graphSelectedCount) els.graphSelectedCount.textContent = selectedCountText;
  if (els.graphSelectionAnnouncement) els.graphSelectionAnnouncement.textContent = selectedCountText;
  els.graphDocumentSelectorButton.setAttribute("aria-expanded", String(state.graphSettings.selectorOpen));
  if (els.graphDocumentDropdown) els.graphDocumentDropdown.hidden = !state.graphSettings.selectorOpen;
  if (els.graphDocumentSearchInput && els.graphDocumentSearchInput.value !== state.graphSettings.documentSearch) {
    els.graphDocumentSearchInput.value = state.graphSettings.documentSearch;
  }
  renderGraphDocumentOptions(allDocs);
  renderSelectedDocumentChips(selectedDocs);
  renderGraphSelectionMessage(selectedDocs.length);
}

function renderGraphDocumentOptions(documents) {
  if (!els.graphDocumentOptions) return;
  const search = normalizeSearchText(state.graphSettings.documentSearch);
  const filteredDocs = documents.filter((doc) => !search || normalizeSearchText(`${doc.name} ${doc.category} ${doc.typeLabel}`).includes(search));
  if (!filteredDocs.length) {
    els.graphDocumentOptions.innerHTML = `<div class="document-selector-empty">No matching documents.</div>`;
    return;
  }
  const selected = new Set(state.graphSettings.selectedDocumentIds);
  els.graphDocumentOptions.innerHTML = filteredDocs
    .map((doc) => {
      const ready = doc.processingStatus === "ready" && doc.searchChunks.length > 0;
      const checked = selected.has(doc.id);
      const status = ready ? "Ready" : doc.processingStatus === "failed" ? "Failed" : "Processing";
      return `<div class="document-option ${ready ? "" : "disabled"}" tabindex="${ready ? "0" : "-1"}" role="option" aria-selected="${checked}" aria-disabled="${ready ? "false" : "true"}" data-graph-doc-option="${escapeHtml(doc.id)}">
        <input type="checkbox" ${checked ? "checked" : ""} ${ready ? "" : "disabled"} tabindex="-1" aria-label="${escapeHtml(doc.name)}" />
        <div class="document-option-text">
          <strong class="document-option-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</strong>
          <span>${escapeHtml(doc.category || "General HR")} · ${escapeHtml(doc.typeLabel || "FILE")} · ${escapeHtml(status)}</span>
        </div>
        <span class="status-badge ${ready ? "ready" : "disabled"}">${escapeHtml(status)}</span>
      </div>`;
    })
    .join("");
}

function renderSelectedDocumentChips(selectedDocs) {
  if (!els.graphSelectedChips) return;
  if (!selectedDocs.length) {
    els.graphSelectedChips.innerHTML = "";
    return;
  }
  const visibleDocs = state.graphSettings.chipsExpanded ? selectedDocs : selectedDocs.slice(0, 3);
  const hiddenCount = selectedDocs.length - visibleDocs.length;
  els.graphSelectedChips.innerHTML = visibleDocs
    .map(
      (doc) => `<span class="selected-document-chip" title="${escapeHtml(doc.name)}">
        <span>${escapeHtml(shortDocumentName(doc.name))}</span>
        <button type="button" data-remove-graph-doc="${escapeHtml(doc.id)}" aria-label="Remove ${escapeHtml(doc.name)}">×</button>
      </span>`
    )
    .join("");
  if (hiddenCount > 0 || state.graphSettings.chipsExpanded) {
    els.graphSelectedChips.innerHTML += `<button class="more-chip" type="button" data-expand-graph-chips>${state.graphSettings.chipsExpanded ? "Show less" : `+${hiddenCount} more`}</button>`;
  }
}

function renderGraphSelectionMessage(selectedCount) {
  if (!els.graphSelectionMessage) return;
  if (state.graphSettings.scope !== "Choose Specific Documents") {
    els.graphSelectionMessage.textContent = "Use this selector when choosing specific documents.";
    els.graphSelectionMessage.classList.remove("warning-text");
    return;
  }
  if (selectedCount === 0) {
    els.graphSelectionMessage.textContent = "Choose at least one ready document.";
    els.graphSelectionMessage.classList.add("warning-text");
  } else if (selectedCount === 1) {
    els.graphSelectionMessage.textContent = "A single-document graph will show concepts and relationships inside that document.";
    els.graphSelectionMessage.classList.remove("warning-text");
  } else {
    els.graphSelectionMessage.textContent = "A multi-document graph can reveal shared rules, overlapping responsibilities, and policy conflicts.";
    els.graphSelectionMessage.classList.remove("warning-text");
  }
}

function renderGraphFilterOptions() {
  if (!els.graphNodeTypeFilter) return;
  const availableNodeTypes = new Set(state.currentGraph.nodes.map((node) => node.type).filter(Boolean));
  const nodeTypes = Object.entries(graphNodeGroupOptions)
    .filter(([label, types]) => label === "All Node Types" || types.some((type) => availableNodeTypes.has(type)))
    .map(([label]) => label);
  const documents = ["All Documents", ...new Set(state.currentGraph.nodes.map((node) => node.filename).filter(Boolean))];
  const availableRelationships = new Set(state.currentGraph.edges.map((edge) => edge.relationship).filter(Boolean));
  const relationships = graphRelationshipFilterOptions.filter((relationship) => relationship === "All Relationships" || availableRelationships.has(relationship));
  if (!nodeTypes.includes(state.graphSettings.nodeType)) state.graphSettings.nodeType = "All Node Types";
  if (!documents.includes(state.graphSettings.document)) state.graphSettings.document = "All Documents";
  if (!relationships.includes(state.graphSettings.relationship)) state.graphSettings.relationship = "All Relationships";
  els.graphNodeTypeFilter.innerHTML = nodeTypes.map((value) => `<option${value === state.graphSettings.nodeType ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
  els.graphDocumentFilter.innerHTML = documents.map((value) => `<option${value === state.graphSettings.document ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
  els.graphRelationshipFilter.innerHTML = relationships.map((value) => `<option${value === state.graphSettings.relationship ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
  if (els.graphSearchFilterGroup) els.graphSearchFilterGroup.hidden = !state.currentGraph.nodes.length;
  if (els.graphNodeTypeFilterGroup) els.graphNodeTypeFilterGroup.hidden = nodeTypes.length <= 1;
  if (els.graphDocumentFilterGroup) els.graphDocumentFilterGroup.hidden = documents.length <= 1;
  if (els.graphRelationshipFilterGroup) els.graphRelationshipFilterGroup.hidden = relationships.length <= 1;
  if (els.graphConfidenceFilterGroup) els.graphConfidenceFilterGroup.hidden = !state.currentGraph.nodes.length && !state.currentGraph.edges.length;
  if (els.graphConfidenceInput) els.graphConfidenceInput.value = String(state.graphSettings.minConfidence);
  if (els.graphConfidenceValue) els.graphConfidenceValue.textContent = `${state.graphSettings.minConfidence}%`;
  if (els.hideIsolatedNodes) els.hideIsolatedNodes.checked = state.graphSettings.hideIsolated;
  if (els.toggleGraphLabels) els.toggleGraphLabels.checked = state.graphSettings.showLabels;
}

function toggleGraphDocumentSelection(docId) {
  const doc = getSearchableDocuments().find((item) => item.id === docId);
  if (!doc) return;
  state.graphSettings.scope = "Choose Specific Documents";
  const selected = new Set(state.graphSettings.selectedDocumentIds);
  if (selected.has(docId)) {
    selected.delete(docId);
  } else {
    selected.add(docId);
  }
  state.graphSettings.selectedDocumentIds = [...selected];
  announceGraphSelection();
  renderGraphSettings();
}

function announceGraphSelection() {
  if (!els.graphSelectionAnnouncement) return;
  const count = state.graphSettings.selectedDocumentIds.length;
  els.graphSelectionAnnouncement.textContent = `${count} document${count === 1 ? "" : "s"} selected`;
}

function shortDocumentName(name) {
  const base = String(name || "").replace(/\.(docx|pdf|txt|md|html|csv|json)$/i, "");
  return base.length > 24 ? `${base.slice(0, 21)}...` : base;
}

function getDocumentsForGraphCategory(categoryLabel, docs = getSearchableDocuments()) {
  if (categoryLabel === "All Categories") return docs;
  const config = graphCategoryOptions.find((item) => item.label === categoryLabel);
  if (!config) return [];
  return docs.filter((doc) => {
    const combined = normalizeSearchText(`${doc.category} ${doc.name}`);
    if (config.matches.some((match) => normalizeSearchText(doc.category) === normalizeSearchText(match))) return true;
    if (categoryLabel === "Leave and Attendance") return /\b(leave|attendance|absence|holiday|maternity|paternity|parental|sick)\b/.test(combined);
    if (categoryLabel === "Workplace Conduct") return /\b(conduct|disciplinary|grievance|equal|diversity|harassment|workplace)\b/.test(combined);
    if (categoryLabel === "Employee Policies") return /\b(policy|policies|employee|handbook)\b/.test(combined);
    return false;
  });
}

function getGraphConfigValidation() {
  const docs = getGraphScopeDocuments();
  if (state.graphGeneration.active) {
    return { valid: false, docs, message: "Graph generation is already running." };
  }
  if (state.graphSettings.scope === "Choose Specific Documents" && state.graphSettings.selectedDocumentIds.length === 0) {
    return { valid: false, docs, message: "Choose at least one ready document." };
  }
  if (!docs.length) {
    return { valid: false, docs, message: state.documents.length ? "Your documents are still processing or could not be indexed." : "Upload HR documents to create a Knowledge Graph." };
  }
  return { valid: true, docs, message: `Ready to analyze ${docs.length} document${docs.length === 1 ? "" : "s"}.` };
}

function updateGraphGenerateState() {
  const validation = getGraphConfigValidation();
  if (els.graphReadySummary) els.graphReadySummary.textContent = validation.message;
  if (els.generateGraphButton) {
    els.generateGraphButton.disabled = !validation.valid || state.graphGeneration.active;
    els.generateGraphButton.innerHTML = `<i data-lucide="${state.graphGeneration.active ? "loader" : "network"}"></i>${state.graphGeneration.active ? "Generating Graph..." : "Generate Knowledge Graph"}`;
  }
  if (els.regenerateGraphButton) els.regenerateGraphButton.disabled = state.graphGeneration.active || !state.currentGraph.nodes.length;
  if (els.clearGraphButton) els.clearGraphButton.disabled = state.graphGeneration.active || !state.currentGraph.nodes.length;
}

async function generateKnowledgeGraph() {
  const validation = getGraphConfigValidation();
  if (!validation.valid) {
    setGraphStatus(validation.message, "warning");
    renderKnowledgeGraph();
    renderGraphSettings();
    return;
  }
  const docs = getGraphScopeDocuments();
  if (!docs.length) {
    setGraphStatus(validation.message, "warning");
    renderKnowledgeGraph();
    return;
  }
  if (!window.cytoscape) {
    setGraphStatus("Cytoscape.js could not be loaded. Check the CDN connection and reload.", "warning");
    return;
  }

  setGraphGenerationStage(0);
  const sources = buildGraphEvidence(docs, 28);
  let graphPayload;
  const apiKey = runtimeGeminiApiKey;

  if (apiKey) {
    try {
      setGraphGenerationStage(1);
      graphPayload = await askGeminiForGraph(sources, apiKey);
      setGraphGenerationStage(2);
    } catch (error) {
      graphPayload = buildLocalGraphPayload(sources);
      setGraphStatus(`${getGeminiFallbackPrefix(error)} Local graph was generated from document evidence.`, "warning");
      setGraphGenerationStage(2);
    }
  } else {
    graphPayload = buildLocalGraphPayload(sources);
    setGraphStatus("Add a Gemini API key to generate live AI content. A local evidence-backed graph was generated for this session.", "warning");
    setGraphGenerationStage(2);
  }

  setGraphGenerationStage(3);
  state.currentGraph = validateGraphPayload(graphPayload, sources);
  setGraphGenerationStage(4);
  state.currentGraph.generatedAt = Date.now();
  state.currentGraph.scope = state.graphSettings.scope;
  state.currentGraph.status = "completed";
  state.metrics.graphsGenerated += 1;
  state.metrics.lastGraphGeneration = state.currentGraph.generatedAt;
  state.selectedGraphItem = null;
  renderGraphSettings();
  renderKnowledgeGraph();
  renderDashboard();
  setGraphGenerationStage(5, false);
  setGraphStatus(`Graph generated with ${state.currentGraph.nodes.length} nodes and ${state.currentGraph.edges.length} relationships.`);
}

function getGraphScopeDocuments() {
  const readyDocs = getSearchableDocuments();
  if (state.graphSettings.selectedDocumentIds.length && state.graphSettings.scope === "All Ready Documents") {
    state.graphSettings.scope = "Choose Specific Documents";
  }
  const scope = state.graphSettings.scope;
  if (scope === "Current Preview Document") {
    const doc = getPreviewDocument();
    return doc?.processingStatus === "ready" ? [doc] : [];
  }
  if (scope === "Choose Specific Documents") {
    const selected = new Set(state.graphSettings.selectedDocumentIds);
    return readyDocs.filter((doc) => selected.has(doc.id));
  }
  if (scope === "Document Category" && state.graphSettings.category !== "All Categories") {
    return getDocumentsForGraphCategory(state.graphSettings.category, readyDocs);
  }
  if (scope === "Latest Edited Versions") {
    return readyDocs;
  }
  return readyDocs;
}

function setGraphGenerationStage(stageIndex, active = true) {
  state.graphGeneration = {
    active,
    stageIndex,
    stage: graphGenerationStages[stageIndex] || "",
  };
  renderGraphSettings();
  renderKnowledgeGraph();
}

function clearKnowledgeGraph() {
  state.currentGraph = createEmptyGraph();
  state.selectedGraphItem = null;
  state.cytoscapeInstance?.destroy?.();
  state.cytoscapeInstance = null;
  state.graphGeneration = { active: false, stage: "", stageIndex: -1 };
  setGraphStatus("Choose a graph source and select Generate Knowledge Graph.");
  renderGraphSettings();
  renderKnowledgeGraph();
  renderDashboard();
}

function buildGraphEvidence(docs, limit = 24) {
  const sources = [];
  docs.forEach((doc) => {
    const chunks = (doc.searchChunks || []).slice(0, Math.max(2, Math.ceil(limit / Math.max(1, docs.length))));
    chunks.forEach((chunk) => {
      if (sources.length >= limit) return;
      sources.push({
        sourceId: `SOURCE_${sources.length + 1}`,
        docId: doc.id,
        filename: doc.name,
        category: doc.category,
        refType: chunk.refType || "Section",
        refValue: chunk.refValue || 1,
        refLabel: chunk.refLabel || "Section 1",
        quote: shorten(bestEvidenceQuote(chunk) || chunk.text, 520),
        text: shorten(chunk.text, 900),
        confidence: Math.min(0.98, Math.max(0.62, (chunk.score || 45) / 100)),
      });
    });
  });
  return sources;
}

async function askGeminiForGraph(sources, apiKey) {
  const evidenceBlock = sources
    .map((source) => `${source.sourceId}
Document ID: ${source.docId}
Filename: ${source.filename}
Location: ${source.refLabel}
Evidence: "${source.text}"`)
    .join("\n\n");
  const prompt = `You are PeopleMind AI. Create an HR knowledge graph using only the provided source IDs.

Return valid JSON only:
{
  "nodes": [
    {"id":"node_1","label":"Annual Leave","type":"Benefit","description":"Employee annual-leave entitlement","sourceId":"SOURCE_1","quote":"exact quote","confidence":0.86}
  ],
  "edges": [
    {"id":"edge_1","source":"node_1","target":"node_2","relationship":"Requires","explanation":"short explanation","sourceId":"SOURCE_2","quote":"exact quote","confidence":0.82}
  ]
}

Allowed node types: ${graphNodeTypes.join(", ")}.
Allowed relationships: ${graphRelationshipTypes.join(", ")}.
Rules:
- Use only SOURCE IDs listed below.
- Every node and edge must have sourceId and supporting quote.
- Do not invent filenames, pages, sections, people, policies, or relationships.
- Prefer 8 to 24 useful nodes and 4 to 30 relationships.

SOURCES:
${evidenceBlock}`;

  const result = await callGemini({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.15, topP: 0.8, maxOutputTokens: 3800, responseMimeType: "application/json" },
  });
  return JSON.parse(extractJsonObjectCandidate(result.text));
}

function buildLocalGraphPayload(sources) {
  const nodes = [];
  const edges = [];
  const addNode = (node) => {
    const existing = nodes.find((item) => normalizeSearchText(item.label) === normalizeSearchText(node.label) && item.sourceId === node.sourceId);
    if (existing) return existing.id;
    nodes.push(node);
    return node.id;
  };

  sources.forEach((source, index) => {
    const documentNodeId = addNode({
      id: `doc_${index + 1}`,
      label: source.filename,
      type: "HR Document",
      description: `Uploaded HR document in ${source.category || "General HR"}.`,
      sourceId: source.sourceId,
      quote: source.quote,
      confidence: source.confidence,
    });
    const text = normalizeSearchText(source.text);
    const patterns = [
      { type: "Employee", label: "Employee", relationship: "Applies To", test: /\b(employee|employees|worker|workers)\b/ },
      { type: "Manager", label: "Manager", relationship: "Responsible For", test: /\b(manager|line manager|supervisor)\b/ },
      { type: "HR Department", label: "HR Department", relationship: "Reviewed By", test: /\b(hr|human resources)\b/ },
      { type: "Responsibility", label: "Employee Responsibilities", relationship: "Requires", test: /\b(must|responsible|required|expected|shall)\b/ },
      { type: "Benefit", label: "Employee Benefits", relationship: "Provides", test: /\b(benefit|leave|entitlement|pay|salary|holiday)\b/ },
      { type: "Training Requirement", label: "Training Requirement", relationship: "Must Complete", test: /\b(training|induction|learning|course)\b/ },
      { type: "Approval Process", label: "Approval Process", relationship: "Approves", test: /\b(approve|approval|authori[sz]ed|permission)\b/ },
      { type: "Compliance Requirement", label: "Compliance Requirement", relationship: "Requires", test: /\b(compliance|legal|regulation|law|policy)\b/ },
      { type: "Privacy Requirement", label: "Privacy Requirement", relationship: "Restricts", test: /\b(confidential|privacy|data protection|personal data)\b/ },
      { type: "Deadline", label: "Deadline", relationship: "Requires", test: /\b(deadline|within|days?|week|month|date)\b/ },
    ];
    patterns
      .filter((pattern) => pattern.test.test(text))
      .slice(0, 4)
      .forEach((pattern, patternIndex) => {
        const nodeId = addNode({
          id: `node_${index + 1}_${patternIndex + 1}`,
          label: pattern.label,
          type: pattern.type,
          description: `Extracted from ${source.filename}.`,
          sourceId: source.sourceId,
          quote: source.quote,
          confidence: source.confidence,
        });
        edges.push({
          id: `edge_${index + 1}_${patternIndex + 1}`,
          source: documentNodeId,
          target: nodeId,
          relationship: pattern.relationship,
          explanation: `${source.filename} includes evidence related to ${pattern.label}.`,
          sourceId: source.sourceId,
          quote: source.quote,
          confidence: source.confidence,
        });
      });
  });
  return { nodes, edges };
}

function validateGraphPayload(payload, sources) {
  const sourceMap = new Map(sources.map((source) => [source.sourceId, source]));
  const nodes = (Array.isArray(payload?.nodes) ? payload.nodes : [])
    .filter((node) => sourceMap.has(node.sourceId))
    .map((node, index) => {
      const source = sourceMap.get(node.sourceId);
      return {
        id: sanitizeId(node.id || `node_${index + 1}`),
        label: String(node.label || "Untitled node").slice(0, 80),
        type: graphNodeTypes.includes(node.type) ? node.type : titleCaseStatus(node.type || "Policy Section"),
        description: String(node.description || "").slice(0, 260),
        documentId: source.docId,
        filename: source.filename,
        refType: source.refType,
        refValue: source.refValue,
        refLabel: source.refLabel,
        quote: shorten(node.quote || source.quote, 320),
        confidence: clamp(Number(node.confidence || source.confidence || 0.7), 0, 1),
        sourceId: node.sourceId,
      };
    });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(payload?.edges) ? payload.edges : [])
    .filter((edge) => sourceMap.has(edge.sourceId) && nodeIds.has(sanitizeId(edge.source)) && nodeIds.has(sanitizeId(edge.target)))
    .map((edge, index) => {
      const source = sourceMap.get(edge.sourceId);
      return {
        id: sanitizeId(edge.id || `edge_${index + 1}`),
        source: sanitizeId(edge.source),
        target: sanitizeId(edge.target),
        relationship: graphRelationshipTypes.includes(edge.relationship) ? edge.relationship : titleCaseStatus(edge.relationship || "References"),
        explanation: String(edge.explanation || "").slice(0, 280),
        documentId: source.docId,
        filename: source.filename,
        refType: source.refType,
        refValue: source.refValue,
        refLabel: source.refLabel,
        quote: shorten(edge.quote || source.quote, 320),
        confidence: clamp(Number(edge.confidence || source.confidence || 0.7), 0, 1),
        sourceId: edge.sourceId,
      };
    });
  return { nodes, edges, sources, generatedAt: Date.now(), status: "completed", scope: state.graphSettings.scope, selectedItemId: null };
}

function sanitizeId(value) {
  return String(value || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function renderKnowledgeGraph() {
  if (!els.knowledgeGraphCanvas) return;
  if (state.currentPage !== "knowledgeGraph") return;
  if (state.graphGeneration.active) {
    renderGraphProgress();
    renderGraphDetails();
    return;
  }
  if (!state.currentGraph.nodes.length) {
    els.knowledgeGraphCanvas.innerHTML = renderGraphEmptyState();
    renderGraphDetails();
    return;
  }
  if (!window.cytoscape) {
    els.knowledgeGraphCanvas.innerHTML = `<div class="empty-card warning">Cytoscape.js could not be loaded. Check the CDN connection and reload.</div>`;
    return;
  }
  state.cytoscapeInstance?.destroy?.();
  els.knowledgeGraphCanvas.innerHTML = "";
  state.cytoscapeInstance = cytoscape({
    container: els.knowledgeGraphCanvas,
    elements: [
      ...state.currentGraph.nodes.map((node) => ({ data: node })),
      ...state.currentGraph.edges.map((edge) => ({ data: edge })),
    ],
    style: [
      { selector: "node", style: { label: "data(label)", "background-color": "#0f766e", color: "#111827", "font-size": 10, "text-wrap": "wrap", "text-max-width": 100, width: 34, height: 34, "border-width": 2, "border-color": "#ffffff" } },
      { selector: "node[type = 'HR Document']", style: { "background-color": "#c51621", shape: "round-rectangle", width: 54, height: 36 } },
      { selector: "edge", style: { label: "data(relationship)", width: 1.5, "line-color": "#94a3b8", "target-arrow-color": "#94a3b8", "target-arrow-shape": "triangle", "curve-style": "bezier", "font-size": 8, color: "#475569", "text-background-color": "#ffffff", "text-background-opacity": 0.85 } },
      { selector: ".faded", style: { opacity: 0.15 } },
      { selector: ".highlighted", style: { "border-color": "#f59e0b", "border-width": 4, "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", opacity: 1 } },
      { selector: ".hide-labels", style: { label: "" } },
    ],
    layout: { name: "cose", animate: false, fit: true, padding: 45 },
  });
  state.cytoscapeInstance.on("tap", "node, edge", (event) => {
    const item = event.target.data();
    state.selectedGraphItem = { id: item.id, type: event.target.isNode() ? "node" : "edge" };
    highlightGraphConnections(item.id);
    renderGraphDetails();
  });
  state.cytoscapeInstance.on("tap", (event) => {
    if (event.target === state.cytoscapeInstance) {
      state.selectedGraphItem = null;
      state.cytoscapeInstance.elements().removeClass("highlighted faded");
      renderGraphDetails();
    }
  });
  applyGraphFilters();
  renderGraphDetails();
}

function renderGraphProgress() {
  const current = Math.max(0, state.graphGeneration.stageIndex);
  els.knowledgeGraphCanvas.innerHTML = `<div class="graph-progress-card">
    <div class="graph-progress-header">
      <i data-lucide="network"></i>
      <div>
        <strong>${escapeHtml(state.graphGeneration.stage || "Generating graph")}</strong>
        <span>PeopleMind AI is building an evidence-backed graph from selected documents.</span>
      </div>
    </div>
    <ol class="graph-progress-list">
      ${graphGenerationStages
        .map(
          (stage, index) => `<li class="${index < current ? "done" : index === current ? "active" : ""}">
            <span>${index < current ? "✓" : index + 1}</span>
            <strong>${escapeHtml(stage)}</strong>
          </li>`
        )
        .join("")}
    </ol>
  </div>`;
  refreshIcons();
}

function renderGraphEmptyState() {
  const readyCount = getSearchableDocuments().length;
  if (!state.documents.length) {
    return `<div class="empty-card graph-empty-state">
      <h3>Upload HR documents to create a Knowledge Graph.</h3>
      <div class="empty-actions">
        <button class="secondary-button" type="button" data-graph-empty-action="workspace"><i data-lucide="upload"></i>Go to Workspace</button>
        <button class="small-button" type="button" data-graph-empty-action="learn"><i data-lucide="sparkles"></i>Learn About Knowledge Graphs</button>
      </div>
    </div>`;
  }
  if (!readyCount) {
    return `<div class="empty-card graph-empty-state">
      <h3>Your documents are still processing or could not be indexed.</h3>
      <p>Wait for documents to become ready, or remove files that failed processing.</p>
    </div>`;
  }
  return `<div class="empty-card graph-empty-state">
    <h3>Choose a graph source and select Generate Knowledge Graph.</h3>
    <p>${escapeHtml(getGraphConfigValidation().message)}</p>
  </div>`;
}

function applyGraphFilters() {
  const cy = state.cytoscapeInstance;
  if (!cy) return;
  const search = normalizeSearchText(els.graphSearchInput?.value || "");
  const nodeType = state.graphSettings.nodeType;
  const documentFilter = state.graphSettings.document;
  const relationshipFilter = state.graphSettings.relationship;
  const minimumConfidence = (Number(state.graphSettings.minConfidence) || 0) / 100;
  const allowedNodeTypes = graphNodeGroupOptions[nodeType] || [];
  cy.elements().show().removeClass("hide-labels");
  cy.nodes().forEach((node) => {
    const data = node.data();
    const hiddenBySearch = search && !normalizeSearchText(`${data.label} ${data.description}`).includes(search);
    const hiddenByType = nodeType !== "All Node Types" && !allowedNodeTypes.includes(data.type);
    const hiddenByDocument = documentFilter !== "All Documents" && data.filename !== documentFilter;
    const hiddenByConfidence = Number(data.confidence || 0) < minimumConfidence;
    if (hiddenBySearch || hiddenByType || hiddenByDocument || hiddenByConfidence) node.hide();
    if (!state.graphSettings.showLabels) node.addClass("hide-labels");
  });
  cy.edges().forEach((edge) => {
    const data = edge.data();
    const hiddenByRelationship = relationshipFilter !== "All Relationships" && data.relationship !== relationshipFilter;
    const hiddenByConfidence = Number(data.confidence || 0) < minimumConfidence;
    if (hiddenByRelationship || hiddenByConfidence || edge.source().hidden() || edge.target().hidden()) edge.hide();
    if (!state.graphSettings.showLabels) edge.addClass("hide-labels");
  });
  if (state.graphSettings.hideIsolated) {
    cy.nodes(":visible").forEach((node) => {
      if (node.connectedEdges(":visible").length === 0) node.hide();
    });
  }
}

function renderGraphDetails() {
  if (!els.graphDetailsPanel) return;
  const selected = state.selectedGraphItem;
  if (!selected) {
    els.graphDetailsPanel.innerHTML = `<p class="helper-text">Select a node or relationship to inspect its evidence.</p>`;
    return;
  }
  const isNode = selected.type === "node";
  const item = isNode ? state.currentGraph.nodes.find((node) => node.id === selected.id) : state.currentGraph.edges.find((edge) => edge.id === selected.id);
  if (!item) return;
  if (isNode) {
    const connected = state.currentGraph.edges.filter((edge) => edge.source === item.id || edge.target === item.id);
    els.graphDetailsPanel.innerHTML = `<h3>${escapeHtml(item.label)}</h3>
      <p><b>Type:</b> ${escapeHtml(item.type)}</p>
      <p>${escapeHtml(item.description || "No description provided.")}</p>
      <p><b>Connected nodes:</b> ${escapeHtml(String(connected.length))}</p>
      <p><b>Source:</b> ${escapeHtml(item.filename)}, ${escapeHtml(item.refLabel)}</p>
      <blockquote>${escapeHtml(item.quote)}</blockquote>
      <p><b>Confidence:</b> ${Math.round((item.confidence || 0) * 100)}%</p>
      <div class="answer-actions">
        <button class="mini-tool reference-action" type="button" data-graph-reference="${escapeHtml(item.id)}"><i data-lucide="file-search"></i>View Reference</button>
        <button class="mini-tool" type="button" data-highlight-graph-item="${escapeHtml(item.id)}"><i data-lucide="network"></i>Highlight Connections</button>
        <button class="mini-tool" type="button" data-ask-graph-item="${escapeHtml(item.id)}"><i data-lucide="message-circle"></i>Ask AI About This</button>
      </div>`;
  } else {
    const sourceNode = state.currentGraph.nodes.find((node) => node.id === item.source);
    const targetNode = state.currentGraph.nodes.find((node) => node.id === item.target);
    els.graphDetailsPanel.innerHTML = `<h3>${escapeHtml(sourceNode?.label || item.source)} -> ${escapeHtml(item.relationship)} -> ${escapeHtml(targetNode?.label || item.target)}</h3>
      <p>${escapeHtml(item.explanation || "Evidence-backed relationship from the uploaded document.")}</p>
      <blockquote>${escapeHtml(item.quote)}</blockquote>
      <p><b>Source:</b> ${escapeHtml(item.filename)}, ${escapeHtml(item.refLabel)}</p>
      <p><b>Confidence:</b> ${Math.round((item.confidence || 0) * 100)}%</p>
      <div class="answer-actions">
        <button class="mini-tool reference-action" type="button" data-graph-reference="${escapeHtml(item.id)}"><i data-lucide="file-search"></i>View Reference</button>
      </div>`;
  }
  refreshIcons();
}

function highlightGraphConnections(itemId) {
  const cy = state.cytoscapeInstance;
  if (!cy) return;
  const element = cy.getElementById(itemId);
  cy.elements().addClass("faded").removeClass("highlighted");
  element.removeClass("faded").addClass("highlighted");
  if (element.isNode()) {
    element.connectedEdges().removeClass("faded").addClass("highlighted");
    element.connectedEdges().connectedNodes().removeClass("faded").addClass("highlighted");
  } else {
    element.connectedNodes().removeClass("faded").addClass("highlighted");
  }
}

async function openGraphReference(itemId) {
  const item = state.currentGraph.nodes.find((node) => node.id === itemId) || state.currentGraph.edges.find((edge) => edge.id === itemId);
  if (!item) return;
  const reference = {
    documentId: item.documentId,
    filename: item.filename,
    quote: item.quote,
    refValue: item.refValue,
    sectionNumber: item.refType === "Section" ? item.refValue : null,
    pageNumber: item.refType === "Page" ? item.refValue : null,
  };
  await openReferenceInDocument(reference);
}

function askAboutGraphItem(itemId) {
  const item = state.currentGraph.nodes.find((node) => node.id === itemId) || state.currentGraph.edges.find((edge) => edge.id === itemId);
  if (!item) return;
  showPage("workspace");
  els.questionInput.value = `Explain ${item.label || item.relationship} from ${item.filename}`;
  els.questionInput.focus();
}

function setGraphStatus(message, tone = "") {
  if (!els.graphStatus) return;
  els.graphStatus.textContent = message;
  els.graphStatus.classList.toggle("warning-text", tone === "warning");
}

function serializeGraphForExport() {
  return {
    exportedAt: new Date().toISOString(),
    scope: state.currentGraph.scope,
    generatedAt: state.currentGraph.generatedAt ? new Date(state.currentGraph.generatedAt).toISOString() : null,
    nodes: state.currentGraph.nodes,
    edges: state.currentGraph.edges,
  };
}

function exportGraphPng() {
  if (!state.cytoscapeInstance) return;
  downloadDataUrl(state.cytoscapeInstance.png({ full: true, scale: 2, bg: "#ffffff" }), "peoplemind-hr-knowledge-graph.png");
}

function exportGraphSvg() {
  const nodes = state.currentGraph.nodes;
  const edges = state.currentGraph.edges;
  const width = 1200;
  const height = 800;
  const positioned = nodes.map((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
    return { ...node, x: width / 2 + Math.cos(angle) * 360, y: height / 2 + Math.sin(angle) * 260 };
  });
  const byId = new Map(positioned.map((node) => [node.id, node]));
  const edgeSvg = edges
    .map((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return "";
      return `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#94a3b8" stroke-width="2" marker-end="url(#arrow)" />`;
    })
    .join("");
  const nodeSvg = positioned
    .map((node) => `<g><circle cx="${node.x}" cy="${node.y}" r="26" fill="${node.type === "HR Document" ? "#c51621" : "#0f766e"}" /><text x="${node.x}" y="${node.y + 44}" text-anchor="middle" font-size="13" fill="#111827">${escapeHtml(shorten(node.label, 28))}</text></g>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" /></marker></defs>
    <rect width="100%" height="100%" fill="#ffffff" />${edgeSvg}${nodeSvg}
  </svg>`;
  downloadText(svg, "peoplemind-hr-knowledge-graph.svg", "image/svg+xml");
}

function wirePresentationEvents() {
  const updateSettings = () => {
    state.presentationSettings = collectPresentationSettings();
    renderPresentationDeck();
  };
  [
    els.presentationTitleInput,
    els.presentationTypeSelect,
    els.presentationAudienceSelect,
    els.presentationScopeSelect,
    els.presentationToneSelect,
    els.deckThemeSelect,
    els.deckAccentInput,
    els.deckCompanyInput,
    els.deckLogoInput,
    els.deckFooterInput,
    els.deckCitationsOption,
    els.deckNotesOption,
    els.deckRecommendationsOption,
    els.deckActionPlanOption,
    els.deckGraphSlideOption,
    els.deckQuestionsOption,
  ].forEach((element) => element?.addEventListener("change", updateSettings));
  els.presentationSlideCountSelect?.addEventListener("change", () => {
    if (els.customSlideCountInput) els.customSlideCountInput.hidden = els.presentationSlideCountSelect.value !== "Custom";
    updateSettings();
  });
  els.customSlideCountInput?.addEventListener("change", updateSettings);
  els.generateDeckButton?.addEventListener("click", generatePresentationDeck);
  els.prevSlideButton?.addEventListener("click", () => moveSlide(-1));
  els.nextSlideButton?.addEventListener("click", () => moveSlide(1));
  els.deckFullscreenButton?.addEventListener("click", () => els.slidePreview?.requestFullscreen?.());
  els.deckZoomOutButton?.addEventListener("click", () => {
    state.presentationDeck.zoom = clamp((state.presentationDeck.zoom || 1) - 0.1, 0.55, 1.35);
    renderPresentationDeck();
  });
  els.deckZoomInButton?.addEventListener("click", () => {
    state.presentationDeck.zoom = clamp((state.presentationDeck.zoom || 1) + 0.1, 0.55, 1.35);
    renderPresentationDeck();
  });
  els.saveSlideEditsButton?.addEventListener("click", saveSlideEdits);
  els.addSlideButton?.addEventListener("click", () => addSlide(createBlankSlide()));
  els.duplicateSlideButton?.addEventListener("click", duplicateCurrentSlide);
  els.deleteSlideButton?.addEventListener("click", deleteCurrentSlide);
  els.moveSlideUpButton?.addEventListener("click", () => moveSlidePosition(-1));
  els.moveSlideDownButton?.addEventListener("click", () => moveSlidePosition(1));
  els.regenerateSlideButton?.addEventListener("click", regenerateCurrentSlide);
  els.shortenSlideButton?.addEventListener("click", shortenCurrentSlide);
  els.expandNotesButton?.addEventListener("click", expandCurrentSlideNotes);
  els.addRecommendationsSlideButton?.addEventListener("click", () => addSlide(buildUtilitySlide("Recommended Improvements", getCurrentRecommendationBullets(), "recommendations")));
  els.addActionItemsSlideButton?.addEventListener("click", () => addSlide(buildUtilitySlide("Priority Action Plan", ["Assign policy owner", "Confirm review timeline", "Validate citations", "Share with authorized HR reviewers"], "action")));
  els.addGraphSlideButton?.addEventListener("click", addKnowledgeGraphSlide);
  els.exportDeckHtmlButton?.addEventListener("click", exportDeckHtml);
  els.downloadPptxButton?.addEventListener("click", downloadPowerPoint);
  els.printDeckButton?.addEventListener("click", printDeck);
  els.exportDeckJsonButton?.addEventListener("click", () => downloadJson(sanitizeDeckForExport(), "peoplemind-hr-presentation.json"));
}

function collectPresentationSettings() {
  const slideCount = els.presentationSlideCountSelect?.value === "Custom" ? Number(els.customSlideCountInput?.value || 7) : Number(els.presentationSlideCountSelect?.value || 7);
  return {
    title: els.presentationTitleInput?.value.trim() || "PeopleMind AI HR Analysis",
    type: els.presentationTypeSelect?.value || "Executive Policy Brief",
    audience: els.presentationAudienceSelect?.value || "HR Leadership",
    scope: els.presentationScopeSelect?.value || "All Ready Documents",
    slideCount: clamp(slideCount, 3, 20),
    tone: els.presentationToneSelect?.value || "Professional",
    theme: els.deckThemeSelect?.value || "PeopleMind Red",
    accentColor: els.deckAccentInput?.value || deckThemes["PeopleMind Red"].accent,
    companyName: els.deckCompanyInput?.value.trim() || "PeopleMind AI",
    logoText: els.deckLogoInput?.value.trim() || "PM",
    footerText: els.deckFooterInput?.value.trim() || "Evidence-based HR document intelligence",
    includeCitations: Boolean(els.deckCitationsOption?.checked),
    includeSpeakerNotes: Boolean(els.deckNotesOption?.checked),
    includeRecommendations: Boolean(els.deckRecommendationsOption?.checked),
    includeActionPlan: Boolean(els.deckActionPlanOption?.checked),
    includeGraphSlide: Boolean(els.deckGraphSlideOption?.checked),
    includeQuestionsSlide: Boolean(els.deckQuestionsOption?.checked),
  };
}

async function generatePresentationDeck() {
  state.presentationSettings = collectPresentationSettings();
  const evidence = getPresentationEvidence();
  if (!evidence.length && state.presentationSettings.scope !== "Current Knowledge Graph") {
    setDeckStatus("Upload HR documents and configure your presentation.", "warning");
    return;
  }
  const apiKey = runtimeGeminiApiKey;
  let deckPayload;
  if (apiKey && evidence.length) {
    try {
      setDeckStatus("Generating evidence-based slide deck with Gemini...");
      deckPayload = await askGeminiForDeck(evidence, state.presentationSettings, apiKey);
    } catch (error) {
      deckPayload = buildLocalDeckPayload(evidence, state.presentationSettings, getGeminiFallbackPrefix(error));
      setDeckStatus(`${getGeminiFallbackPrefix(error)} Local deck was generated from document evidence.`, "warning");
    }
  } else {
    deckPayload = buildLocalDeckPayload(evidence, state.presentationSettings, apiKey ? "" : "Add a Gemini API key to generate live AI content.");
    if (!apiKey) setDeckStatus("Add a Gemini API key to generate live AI content. A local evidence-based deck was generated.", "warning");
  }

  state.presentationDeck = validateDeckPayload(deckPayload, evidence, state.presentationSettings);
  state.presentationDeck.generatedAt = Date.now();
  state.presentationDeck.theme = state.presentationSettings.theme;
  state.presentationDeck.zoom = 1;
  state.currentSlideIndex = 0;
  state.presentationHistory = [{ generatedAt: state.presentationDeck.generatedAt, title: state.presentationDeck.deckTitle, slides: state.presentationDeck.slides.length }, ...state.presentationHistory].slice(0, 10);
  state.metrics.decksGenerated += 1;
  state.metrics.slidesGenerated = state.presentationDeck.slides.length;
  state.metrics.lastPresentationGeneration = state.presentationDeck.generatedAt;
  if (state.presentationSettings.includeGraphSlide) await addKnowledgeGraphSlide({ silent: true });
  renderPresentationDeck();
  renderDashboard();
  setDeckStatus(`Presentation ready with ${state.presentationDeck.slides.length} slides.`);
}

function getPresentationEvidence() {
  const settings = state.presentationSettings;
  if (settings.scope === "Current AI Answer") {
    const answer = [...state.chat].reverse().find((message) => message.role === "assistant" && message.text);
    return answer ? [{ sourceId: "SOURCE_1", docId: answer.references?.[0]?.documentId || "", filename: "Current AI Answer", refLabel: "Current answer", quote: shorten(stripDisplayCitations(answer.text), 500), text: shorten(stripDisplayCitations(answer.text), 900) }] : [];
  }
  if (settings.scope === "Current Knowledge Graph") {
    return state.currentGraph.nodes.slice(0, 12).map((node, index) => ({ sourceId: `SOURCE_${index + 1}`, docId: node.documentId, filename: node.filename, refLabel: node.refLabel, quote: node.quote, text: `${node.label}: ${node.description}. Evidence: ${node.quote}` }));
  }
  return buildGraphEvidence(getDeckScopeDocuments(), 24);
}

function getDeckScopeDocuments() {
  const readyDocs = getSearchableDocuments();
  const scope = state.presentationSettings.scope;
  if (scope === "Current Document") {
    const doc = getPreviewDocument();
    return doc?.processingStatus === "ready" ? [doc] : [];
  }
  if (scope === "Selected Documents") {
    const selected = new Set(state.graphSettings.selectedDocumentIds);
    return readyDocs.filter((doc) => selected.has(doc.id));
  }
  if (scope === "Document Category" && state.graphSettings.category !== "All Categories") {
    return readyDocs.filter((doc) => doc.category === state.graphSettings.category);
  }
  return readyDocs;
}

async function askGeminiForDeck(evidence, settings, apiKey) {
  const evidenceBlock = evidence
    .map((source) => `${source.sourceId}
Filename: ${source.filename}
Location: ${source.refLabel}
Evidence: "${source.text}"`)
    .join("\n\n");
  const prompt = `You are PeopleMind AI. Build a professional HR presentation from uploaded-document evidence only.

Settings:
Title: ${settings.title}
Type: ${settings.type}
Audience: ${settings.audience}
Slides: ${settings.slideCount}
Tone: ${settings.tone}
Include citations: ${settings.includeCitations}
Include speaker notes: ${settings.includeSpeakerNotes}
Include recommendations: ${settings.includeRecommendations}
Include action plan: ${settings.includeActionPlan}
Include questions slide: ${settings.includeQuestionsSlide}

Return valid JSON only:
{
  "deckTitle": "title",
  "subtitle": "PeopleMind AI HR Analysis",
  "slides": [
    {"id":"slide_1","type":"title","title":"Title","subtitle":"Subtitle","bullets":[],"speakerNotes":"","references":[]},
    {"id":"slide_2","type":"content","title":"Slide title","subtitle":"","bullets":["8 to 14 words per bullet"],"speakerNotes":"short notes","references":[{"sourceId":"SOURCE_1","quote":"exact quote"}]}
  ]
}

Rules:
- Exactly ${settings.slideCount} slides unless there is a strong reason to use fewer.
- Use 3 to 6 concise bullets per content slide.
- Do not put raw Markdown or raw JSON in slides.
- Use only SOURCE IDs from the evidence.
- Do not attach citations to AI recommendations unless directly supported.
- Do not invent company facts.

EVIDENCE:
${evidenceBlock}`;

  const result = await callGemini({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.25, topP: 0.85, maxOutputTokens: 5000, responseMimeType: "application/json" },
  });
  return JSON.parse(extractJsonObjectCandidate(result.text));
}

function buildLocalDeckPayload(evidence, settings, prefix = "") {
  const selected = evidence.slice(0, Math.max(3, settings.slideCount));
  const slides = [
    {
      id: "slide_1",
      type: "title",
      title: settings.title,
      subtitle: `${settings.type} for ${settings.audience}`,
      bullets: [],
      speakerNotes: prefix || "Introduce the evidence-based HR review.",
      references: [],
    },
    {
      id: "slide_2",
      type: "content",
      title: "Executive Summary",
      subtitle: "",
      bullets: selected.slice(0, 4).map((source) => shorten(source.quote.replace(/[.;]$/, ""), 92)),
      speakerNotes: "Summarize the strongest findings from uploaded HR documents.",
      references: selected.slice(0, 2).map((source) => ({ sourceId: source.sourceId, quote: source.quote })),
    },
  ];
  const slideIdeas = [
    "Policy Overview",
    "Key Findings",
    "Employee Responsibilities",
    "Manager Responsibilities",
    "Risks and Gaps",
    "Recommended Improvements",
    "Priority Action Plan",
    "Conclusion and Next Steps",
    "Questions",
  ];
  while (slides.length < settings.slideCount) {
    const source = selected[(slides.length - 2) % Math.max(1, selected.length)] || selected[0];
    const title = slideIdeas[(slides.length - 2) % slideIdeas.length];
    const bullets = source
      ? splitSentences(source.text)
          .slice(0, 4)
          .map((sentence) => shorten(sentence.replace(/[.;]$/, ""), 92))
      : ["Generate an HR Knowledge Graph first.", "Upload documents for evidence-backed slides."];
    if (settings.includeRecommendations && /recommend|improve|gap|action/i.test(title)) {
      bullets.push("Review important results with authorized HR staff");
    }
    slides.push({
      id: `slide_${slides.length + 1}`,
      type: "content",
      title,
      subtitle: "",
      bullets: bullets.slice(0, 5),
      speakerNotes: `Explain this slide using evidence from ${source?.filename || "the current session"}.`,
      references: source ? [{ sourceId: source.sourceId, quote: source.quote }] : [],
    });
  }
  return { deckTitle: settings.title, subtitle: "PeopleMind AI HR Analysis", slides };
}

function validateDeckPayload(payload, evidence, settings) {
  const sourceMap = new Map(evidence.map((source) => [source.sourceId, source]));
  const rawSlides = Array.isArray(payload?.slides) ? payload.slides : [];
  const slides = rawSlides
    .filter((slide) => slide?.title)
    .map((slide, index) => {
      const references = (Array.isArray(slide.references) ? slide.references : [])
        .filter((reference) => sourceMap.has(reference.sourceId))
        .slice(0, 3)
        .map((reference) => {
          const source = sourceMap.get(reference.sourceId);
          return {
            sourceId: reference.sourceId,
            quote: shorten(reference.quote || source.quote, 220),
            documentId: source.docId,
            filename: source.filename,
            refLabel: source.refLabel,
          };
        });
      return {
        id: sanitizeId(slide.id || `slide_${index + 1}`),
        type: slide.type || (index === 0 ? "title" : "content"),
        title: shorten(String(slide.title || `Slide ${index + 1}`).replace(/[#*`]/g, ""), 88),
        subtitle: shorten(String(slide.subtitle || "").replace(/[#*`]/g, ""), 120),
        bullets: (Array.isArray(slide.bullets) ? slide.bullets : [])
          .map((bullet) => shorten(String(bullet).replace(/[#*`]/g, "").trim(), 96))
          .filter(Boolean)
          .slice(0, 6),
        speakerNotes: String(slide.speakerNotes || "").replace(/```/g, "").slice(0, 1000),
        references,
        manuallyEdited: Boolean(slide.manuallyEdited),
      };
    });
  const uniqueSlides = [];
  const seenTitles = new Set();
  slides.forEach((slide) => {
    const key = normalizeSearchText(`${slide.title} ${slide.bullets.join(" ")}`).slice(0, 100);
    if (seenTitles.has(key)) return;
    seenTitles.add(key);
    uniqueSlides.push(slide);
  });
  if (!uniqueSlides.length) return buildLocalDeckPayload(evidence, settings);
  return {
    deckTitle: payload.deckTitle || settings.title,
    subtitle: payload.subtitle || "PeopleMind AI HR Analysis",
    slides: uniqueSlides.slice(0, settings.slideCount),
    status: "completed",
    theme: settings.theme,
    zoom: state.presentationDeck.zoom || 1,
  };
}

function renderPresentationDeck() {
  if (!els.slidePreview) return;
  if (state.currentPage !== "presentationDeck" && !state.presentationDeck.slides.length) return;
  syncPresentationInputs();
  const deck = state.presentationDeck;
  if (!deck.slides.length) {
    els.slidePreview.innerHTML = `<div class="empty-card">Upload HR documents and configure your presentation.</div>`;
    if (els.slideCounter) els.slideCounter.textContent = "No slides";
    clearSlideEditor();
    return;
  }
  state.currentSlideIndex = clamp(state.currentSlideIndex, 0, deck.slides.length - 1);
  const slide = deck.slides[state.currentSlideIndex];
  const theme = getCurrentDeckTheme();
  const references = (slide.references || []).map((reference) => `${reference.filename || reference.sourceId}, ${reference.refLabel || ""}`).join(" | ");
  els.slidePreview.style.setProperty("--deck-zoom", String(deck.zoom || 1));
  els.slidePreview.innerHTML = `<article class="slide-frame ${escapeHtml(slugify(deck.theme || state.presentationSettings.theme))}" style="--slide-accent:${escapeHtml(theme.accent)};--slide-bg:${escapeHtml(theme.background)};--slide-text:${escapeHtml(theme.text)};--slide-muted:${escapeHtml(theme.muted)};--slide-footer:${escapeHtml(theme.footer)}">
    <header>
      <span>${escapeHtml(state.presentationSettings.logoText || "PM")}</span>
      <strong>${escapeHtml(state.presentationSettings.companyName || "PeopleMind AI")}</strong>
    </header>
    <main>
      <p class="slide-kicker">${escapeHtml(deck.subtitle || "PeopleMind AI HR Analysis")}</p>
      <h2>${escapeHtml(slide.title)}</h2>
      ${slide.subtitle ? `<h3>${escapeHtml(slide.subtitle)}</h3>` : ""}
      ${slide.type === "graph" && slide.graphImage ? `<img class="slide-graph-image" src="${escapeHtml(slide.graphImage)}" alt="Knowledge graph" />` : ""}
      ${slide.bullets?.length ? `<ul>${slide.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>` : ""}
    </main>
    <footer>
      <span>${escapeHtml(state.presentationSettings.footerText || "")}</span>
      <span>${state.currentSlideIndex + 1} / ${deck.slides.length}</span>
    </footer>
    ${references && state.presentationSettings.includeCitations ? `<div class="slide-sources">${escapeHtml(references)}</div>` : ""}
  </article>`;
  if (els.slideCounter) els.slideCounter.textContent = `Slide ${state.currentSlideIndex + 1} of ${deck.slides.length}`;
  fillSlideEditor(slide);
  refreshIcons();
}

function syncPresentationInputs() {
  if (!els.presentationTitleInput) return;
  const settings = state.presentationSettings;
  els.presentationTitleInput.value = settings.title;
  els.presentationTypeSelect.value = settings.type;
  els.presentationAudienceSelect.value = settings.audience;
  els.presentationScopeSelect.value = settings.scope;
  els.presentationSlideCountSelect.value = ["5", "7", "10", "12"].includes(String(settings.slideCount)) ? String(settings.slideCount) : "Custom";
  if (els.customSlideCountInput) {
    els.customSlideCountInput.hidden = els.presentationSlideCountSelect.value !== "Custom";
    els.customSlideCountInput.value = String(settings.slideCount);
  }
  els.presentationToneSelect.value = settings.tone;
  els.deckThemeSelect.value = settings.theme;
  els.deckAccentInput.value = settings.accentColor;
  els.deckCompanyInput.value = settings.companyName;
  els.deckLogoInput.value = settings.logoText;
  els.deckFooterInput.value = settings.footerText;
  els.deckCitationsOption.checked = settings.includeCitations;
  els.deckNotesOption.checked = settings.includeSpeakerNotes;
  els.deckRecommendationsOption.checked = settings.includeRecommendations;
  els.deckActionPlanOption.checked = settings.includeActionPlan;
  els.deckGraphSlideOption.checked = settings.includeGraphSlide;
  els.deckQuestionsOption.checked = settings.includeQuestionsSlide;
}

function fillSlideEditor(slide) {
  if (!els.slideTitleInput) return;
  els.slideTitleInput.value = slide?.title || "";
  els.slideSubtitleInput.value = slide?.subtitle || "";
  els.slideBulletsInput.value = (slide?.bullets || []).join("\n");
  els.slideNotesInput.value = slide?.speakerNotes || "";
}

function clearSlideEditor() {
  fillSlideEditor({ title: "", subtitle: "", bullets: [], speakerNotes: "" });
}

function getCurrentDeckTheme() {
  const base = deckThemes[state.presentationSettings.theme] || deckThemes["PeopleMind Red"];
  return { ...base, accent: state.presentationSettings.accentColor || base.accent };
}

function moveSlide(delta) {
  if (!state.presentationDeck.slides.length) return;
  state.currentSlideIndex = clamp(state.currentSlideIndex + delta, 0, state.presentationDeck.slides.length - 1);
  renderPresentationDeck();
}

function saveSlideEdits() {
  const slide = state.presentationDeck.slides[state.currentSlideIndex];
  if (!slide) return;
  Object.assign(slide, {
    title: els.slideTitleInput.value.trim() || slide.title,
    subtitle: els.slideSubtitleInput.value.trim(),
    bullets: els.slideBulletsInput.value.split(/\n/).map((line) => shorten(line.trim(), 96)).filter(Boolean).slice(0, 6),
    speakerNotes: els.slideNotesInput.value.trim(),
    manuallyEdited: true,
  });
  renderPresentationDeck();
}

function createBlankSlide() {
  return {
    id: `slide_${crypto.randomUUID().slice(0, 8)}`,
    type: "content",
    title: "New Slide",
    subtitle: "",
    bullets: ["Add a concise evidence-based point"],
    speakerNotes: "",
    references: [],
    manuallyEdited: true,
  };
}

function addSlide(slide) {
  state.presentationDeck.slides.splice(state.currentSlideIndex + 1, 0, slide);
  state.currentSlideIndex += 1;
  renderPresentationDeck();
  renderDashboard();
}

function duplicateCurrentSlide() {
  const slide = state.presentationDeck.slides[state.currentSlideIndex];
  if (!slide) return;
  addSlide({ ...structuredClone(slide), id: `slide_${crypto.randomUUID().slice(0, 8)}`, title: `${slide.title} Copy`, manuallyEdited: true });
}

function deleteCurrentSlide() {
  if (!state.presentationDeck.slides.length) return;
  state.presentationDeck.slides.splice(state.currentSlideIndex, 1);
  state.currentSlideIndex = clamp(state.currentSlideIndex, 0, Math.max(0, state.presentationDeck.slides.length - 1));
  renderPresentationDeck();
  renderDashboard();
}

function moveSlidePosition(delta) {
  const slides = state.presentationDeck.slides;
  const nextIndex = state.currentSlideIndex + delta;
  if (nextIndex < 0 || nextIndex >= slides.length) return;
  [slides[state.currentSlideIndex], slides[nextIndex]] = [slides[nextIndex], slides[state.currentSlideIndex]];
  state.currentSlideIndex = nextIndex;
  renderPresentationDeck();
}

async function regenerateCurrentSlide() {
  const slide = state.presentationDeck.slides[state.currentSlideIndex];
  if (!slide || slide.manuallyEdited) {
    addSystemMessage("This slide has manual edits. PeopleMind AI will not overwrite it automatically.");
    return;
  }
  const evidence = getPresentationEvidence();
  const source = evidence[state.currentSlideIndex % Math.max(1, evidence.length)];
  state.presentationDeck.slides[state.currentSlideIndex] = buildUtilitySlide(slide.title, source ? splitSentences(source.text).slice(0, 5).map((sentence) => shorten(sentence, 92)) : ["No evidence available for this slide"], slide.type || "content", source ? [{ sourceId: source.sourceId, quote: source.quote, filename: source.filename, refLabel: source.refLabel }] : []);
  renderPresentationDeck();
}

function shortenCurrentSlide() {
  const slide = state.presentationDeck.slides[state.currentSlideIndex];
  if (!slide) return;
  slide.bullets = slide.bullets.map((bullet) => shorten(bullet, 58));
  slide.manuallyEdited = true;
  renderPresentationDeck();
}

function expandCurrentSlideNotes() {
  const slide = state.presentationDeck.slides[state.currentSlideIndex];
  if (!slide) return;
  slide.speakerNotes = `${slide.speakerNotes || ""}\n\nDiscuss how this point is supported by the uploaded HR documents and confirm important decisions with authorized HR reviewers.`.trim();
  slide.manuallyEdited = true;
  renderPresentationDeck();
}

function buildUtilitySlide(title, bullets, type = "content", references = []) {
  return {
    id: `slide_${crypto.randomUUID().slice(0, 8)}`,
    type,
    title,
    subtitle: "",
    bullets: bullets.filter(Boolean).slice(0, 6),
    speakerNotes: `Explain ${title.toLowerCase()} in the context of uploaded HR documents.`,
    references,
    manuallyEdited: true,
  };
}

function getCurrentRecommendationBullets() {
  const evidence = state.currentEvidence?.[0] || getPresentationEvidence()[0];
  return getImprovementIdeas(evidence).slice(0, 6);
}

async function addKnowledgeGraphSlide(options = {}) {
  if (!state.currentGraph.nodes.length) {
    if (!options.silent) setDeckStatus("Generate an HR Knowledge Graph first.", "warning");
    return;
  }
  const graphImage = state.cytoscapeInstance?.png ? state.cytoscapeInstance.png({ full: true, scale: 2, bg: "#ffffff" }) : "";
  const references = state.currentGraph.nodes.slice(0, 2).map((node, index) => ({ sourceId: `GRAPH_${index + 1}`, quote: node.quote, filename: node.filename, refLabel: node.refLabel }));
  const slide = {
    id: `slide_graph_${crypto.randomUUID().slice(0, 8)}`,
    type: "graph",
    title: "HR Knowledge Graph",
    subtitle: "Evidence-backed relationships from uploaded documents",
    bullets: ["Shows validated HR policy relationships", "Links concepts to source evidence", "Supports review and presentation discussion"],
    speakerNotes: "Explain the graph as an evidence-backed map of uploaded HR content.",
    references,
    graphImage,
    manuallyEdited: true,
  };
  if (!state.presentationDeck.slides.length) state.presentationDeck = createEmptyDeck();
  state.presentationDeck.slides.push(slide);
  state.currentSlideIndex = state.presentationDeck.slides.length - 1;
  renderPresentationDeck();
}

function exportDeckHtml() {
  if (!state.presentationDeck.slides.length) return;
  const theme = getCurrentDeckTheme();
  const slidesHtml = state.presentationDeck.slides
    .map(
      (slide, index) => `<section class="slide ${index === 0 ? "active" : ""}">
        <header><span>${escapeHtml(state.presentationSettings.logoText)}</span><strong>${escapeHtml(state.presentationSettings.companyName)}</strong></header>
        <main><p>${escapeHtml(state.presentationDeck.subtitle || "")}</p><h1>${escapeHtml(slide.title)}</h1>${slide.subtitle ? `<h2>${escapeHtml(slide.subtitle)}</h2>` : ""}${slide.graphImage ? `<img src="${slide.graphImage}" alt="Knowledge graph" />` : ""}<ul>${(slide.bullets || []).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul></main>
        <footer><span>${escapeHtml(state.presentationSettings.footerText)}</span><span>${index + 1} / ${state.presentationDeck.slides.length}</span></footer>
      </section>`
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(state.presentationDeck.deckTitle)}</title><style>
    body{margin:0;background:#111827;font-family:Inter,Segoe UI,sans-serif;color:${theme.text}}.deck{min-height:100vh;display:grid;place-items:center;padding:24px}.slide{display:none;width:min(1200px,92vw);aspect-ratio:16/9;background:${theme.background};padding:48px;border-radius:8px;box-shadow:0 22px 60px rgba(0,0,0,.35);position:relative}.slide.active{display:flex;flex-direction:column}.slide header,.slide footer{display:flex;justify-content:space-between;align-items:center;color:${theme.muted}}.slide header span{display:grid;place-items:center;width:42px;height:42px;border-radius:8px;background:${theme.accent};color:white;font-weight:900}.slide main{flex:1;display:flex;flex-direction:column;justify-content:center}.slide p{color:${theme.accent};font-weight:800;text-transform:uppercase}.slide h1{font-size:48px;margin:0 0 18px}.slide h2{font-size:24px;color:${theme.muted}}.slide li{font-size:26px;margin:14px 0}.slide img{max-height:390px;object-fit:contain}.controls{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:10px}.controls button{padding:10px 14px;border:0;border-radius:999px;font-weight:800}
  </style></head><body><div class="deck">${slidesHtml}</div><div class="controls"><button onclick="move(-1)">Previous</button><span id="counter"></span><button onclick="move(1)">Next</button><button onclick="document.documentElement.requestFullscreen()">Fullscreen</button></div><script>
    let current=0;const slides=[...document.querySelectorAll('.slide')];function show(){slides.forEach((s,i)=>s.classList.toggle('active',i===current));document.getElementById('counter').textContent=(current+1)+' / '+slides.length}function move(d){current=Math.max(0,Math.min(slides.length-1,current+d));show()}document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')move(1);if(e.key==='ArrowLeft')move(-1)});show();
  </script></body></html>`;
  downloadText(html, "PeopleMind-HR-Presentation.html", "text/html");
}

async function downloadPowerPoint() {
  if (!state.presentationDeck.slides.length) return;
  if (!window.pptxgen) {
    setDeckStatus("PptxGenJS could not be loaded. Check the CDN connection and reload.", "warning");
    return;
  }
  const pptx = new window.pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "PeopleMind AI";
  pptx.subject = "Evidence-based HR presentation";
  const theme = getCurrentDeckTheme();
  state.presentationDeck.slides.forEach((slide, index) => {
    const pptSlide = pptx.addSlide();
    pptSlide.background = { color: theme.background.replace("#", "") };
    pptSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.28, fill: { color: theme.accent.replace("#", "") }, line: { color: theme.accent.replace("#", "") } });
    pptSlide.addText(state.presentationSettings.logoText || "PM", { x: 0.35, y: 0.42, w: 0.55, h: 0.32, fontSize: 12, bold: true, color: "FFFFFF", align: "center", fill: { color: theme.accent.replace("#", "") }, margin: 0.04 });
    pptSlide.addText(slide.title, { x: 0.65, y: 1.0, w: 11.8, h: 0.65, fontSize: index === 0 ? 34 : 25, bold: true, color: theme.text.replace("#", "") });
    if (slide.subtitle) pptSlide.addText(slide.subtitle, { x: 0.68, y: 1.72, w: 11.4, h: 0.4, fontSize: 14, color: theme.muted.replace("#", "") });
    if (slide.graphImage) {
      pptSlide.addImage({ data: slide.graphImage, x: 1.0, y: 2.15, w: 11.2, h: 4.35 });
    } else if (slide.bullets?.length) {
      pptSlide.addText(slide.bullets.map((bullet) => ({ text: bullet, options: { bullet: { type: "ul" }, breakLine: true } })), { x: 0.95, y: 2.2, w: 11.4, h: 3.9, fontSize: 18, color: theme.text.replace("#", ""), fit: "shrink" });
    }
    const refs = (slide.references || []).map((reference) => `${reference.filename || reference.sourceId} ${reference.refLabel || ""}`).join(" | ");
    pptSlide.addText(`${state.presentationSettings.footerText || ""}    ${index + 1}/${state.presentationDeck.slides.length}`, { x: 0.55, y: 7.0, w: 12.2, h: 0.25, fontSize: 8, color: theme.muted.replace("#", "") });
    if (refs && state.presentationSettings.includeCitations) pptSlide.addText(refs, { x: 0.55, y: 6.72, w: 12.2, h: 0.2, fontSize: 7, color: theme.muted.replace("#", "") });
    if (state.presentationSettings.includeSpeakerNotes && slide.speakerNotes && typeof pptSlide.addNotes === "function") pptSlide.addNotes(slide.speakerNotes);
  });
  await pptx.writeFile({ fileName: "PeopleMind-HR-Presentation.pptx" });
}

function printDeck() {
  exportDeckHtml();
  window.print();
}

function sanitizeDeckForExport() {
  return {
    exportedAt: new Date().toISOString(),
    deckTitle: state.presentationDeck.deckTitle,
    subtitle: state.presentationDeck.subtitle,
    generatedAt: state.presentationDeck.generatedAt ? new Date(state.presentationDeck.generatedAt).toISOString() : null,
    settings: { ...state.presentationSettings },
    slides: state.presentationDeck.slides.map((slide) => ({ ...slide, graphImage: slide.graphImage ? "[embedded graph image omitted from JSON export]" : "" })),
  };
}

function setDeckStatus(message, tone = "") {
  if (!els.deckStatus) return;
  els.deckStatus.textContent = message;
  els.deckStatus.classList.toggle("warning-text", tone === "warning");
}

function slugify(value) {
  return normalizeSearchText(value).replace(/[^a-z0-9]+/g, "-");
}

function downloadJson(payload, filename) {
  downloadText(JSON.stringify(createSafeExportState(payload), null, 2), filename, "application/json");
}

function downloadText(text, filename, type = "text/plain") {
  const blob = new Blob([sanitizeExportText(text)], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 200);
}

function createSafeExportState(source) {
  const clone = typeof structuredClone === "function" ? structuredClone(source) : JSON.parse(JSON.stringify(source || {}));
  return scrubApiSecrets(clone);
}

function scrubApiSecrets(value) {
  if (Array.isArray(value)) return value.map(scrubApiSecrets);
  if (!value || typeof value !== "object") return value;
  Object.keys(value).forEach((key) => {
    if (/api.?key|gemini.?key|runtimeGeminiApiKey|sessionStorage|localStorage/i.test(key)) {
      delete value[key];
    } else {
      value[key] = scrubApiSecrets(value[key]);
    }
  });
  return value;
}

function sanitizeExportText(text) {
  let safeText = String(text || "");
  if (runtimeGeminiApiKey) {
    safeText = safeText.split(runtimeGeminiApiKey).join("[redacted api key]");
  }
  return safeText;
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function toCsv(rows) {
  if (!rows?.length) return "";
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !["graphImage"].includes(key))))];
  const escapeCell = (value) => `"${String(Array.isArray(value) ? value.join("; ") : value ?? "").replace(/"/g, '""')}"`;
  return [keys.map(escapeCell).join(","), ...rows.map((row) => keys.map((key) => escapeCell(row[key])).join(","))].join("\n");
}

function exportNotes() {
  const lines = [
    "PeopleMind AI - HR Research Notes",
    `Mode: ${state.mode}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    HR_WARNING,
    "",
    ...state.chat.map((message) => `${message.role.toUpperCase()}: ${message.text}`),
  ];
  downloadText(lines.join("\n\n"), "peoplemind-ai-hr-notes.txt", "text/plain");
}

function tokenize(text) {
  const stopWords = new Set(["the", "and", "for", "with", "from", "that", "this", "what", "are", "you", "can", "read", "file", "does", "into", "only"]);
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((token) => protectedTerms.has(token) || (token.length > 2 && !stopWords.has(token)));
}

function splitSentences(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = [];
  let start = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (!/[.!?]/.test(char)) continue;
    const prev = clean[index - 1] || "";
    const next = clean[index + 1] || "";
    const afterNext = clean[index + 2] || "";
    const insideWord = /[a-z0-9]/i.test(prev) && /[a-z0-9]/i.test(next);
    const likelyBoundary = !next || /\s/.test(next) || /[\])}]/.test(next) || (/\s/.test(next) && /[A-Z\[]/.test(afterNext));
    if (insideWord || !likelyBoundary) continue;
    const sentence = clean.slice(start, index + 1).trim();
    if (sentence) sentences.push(sentence);
    start = index + 1;
  }
  const tail = clean.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences.length ? sentences : [clean];
}

function shorten(text, max) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
