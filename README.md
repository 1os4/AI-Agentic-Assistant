# Build with Agentic Multi-Document Research

Agentic Multi-Document Research is an enterprise HR document intelligence assistant for asking questions across uploaded HR documents. It supports multi-document search, citations, document preview, Gemini-powered answers, AI workflow visibility, an HR dashboard, and a knowledge graph.

## Live Demo

Try the deployed app here:

https://ai-agentic-assistant-pearl.vercel.app/

## Features

- Upload multiple HR documents
- Ask questions grounded in uploaded content
- Search all ready documents by default
- Choose current document or selected documents as search scope
- View source references for answers
- Preview PDF, DOCX, TXT, Markdown, CSV, JSON, and HTML files
- Export notes and workflow data
- Generate HR knowledge graphs
- Store the Gemini API key only in browser session storage
- Prevent exact duplicate document uploads

## Supported Documents

- Employee handbooks
- HR policies
- Job descriptions
- CVs and resumes
- Recruitment documents
- Onboarding documents
- Training material
- Benefits policies
- Performance-review procedures
- Compliance documents

## Privacy Notice

This MVP processes uploaded documents inside the browser where possible. It does not store uploaded documents in an external database. Do not upload real confidential HR files to a public demo or public GitHub repository.

The Gemini API key is stored only in `sessionStorage` and is not committed to the project.

## How To Run Locally

Open the project folder and start a local server:

```bash
python -m http.server 5173
```

Then open:

```text
http://127.0.0.1:5173/index.html
```

## Gemini API Key

1. Open the app.
2. Click `API Key Required`.
3. Paste your Gemini API key.
4. Save it.

The key stays only in the current browser session.

## Deployment

This project can be deployed as a static site using GitHub Pages, Vercel, Netlify, or any static hosting provider.

For production use, place Gemini calls behind a secure server-side API proxy instead of using a browser-side key.

## Important Disclaimer

This tool supports HR document analysis and administrative review. It does not provide legal advice or make final employment decisions. Important results must be reviewed by authorized HR and legal professionals.
