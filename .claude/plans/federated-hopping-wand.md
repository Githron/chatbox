# Plan: Enhance ChatBox Server Reliability and Security

## Context
The current ChatBox server implementation uses synchronous file I/O for message persistence, which can lead to race conditions under high load. It also lacks file type validation, and there is no automated cleanup for historical data. This plan outlines steps to fix these issues.

## Implementation Steps

### 1. Improve File I/O Reliability
*   Use `fs.promises` for asynchronous file reading/writing.
*   Implement a simple memory-caching layer for room history to reduce disk read frequency.

### 2. Add Security & Validation
*   Update `send-file` handler in `server.js` to validate `fileData.type` against an allowed list of mime-types.
*   Ensure uploaded files have a valid structure.

### 3. Implement Automated Data Cleanup
*   Create a task in `server.js` (using `setInterval`) that scans the `data/` directory and removes files older than 7 days.

### 4. Improve User Experience (Mobile)
*   Update `public/style.css` to add `visualViewport` listener logic or improved CSS padding when the keyboard opens.

## Verification
*   **Security Test**: Verify file type blocking works.
*   **Cleanup Test**: Verify the background job triggers for old files.
*   **Performance**: Ensure server remains responsive during high message frequency.
