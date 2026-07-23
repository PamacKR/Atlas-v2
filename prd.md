# **Product Requirements Document (PRD)**

# **Atlas (previously known as Academic OS)**

A centralized academic knowledge platform.

Version 1.0

Throughout this document, "Academic OS" refers to the product now named Atlas. The terminology is retained temporarily while the product evolves. 

---

# **1\. Overview**

Academic OS is a desktop application designed to serve as the central workspace for a student's academic life.

Its primary responsibility is to continuously organize academic information from multiple sources into structured course workspaces.

Academic OS is **not** an AI application.

Instead, it acts as the source of truth that external AI systems (primarily Claude Code) use for reasoning, studying and assignment assistance.

The objective is to eliminate context switching and repetitive uploading of files while ensuring that all academic resources remain organized and accessible.

---

# **2\. Product Goals**

The application should allow a student to:

* Access all academic material from one location.  
* Organize information automatically.  
* Minimize manual file management.  
* Keep course resources continuously synchronized.  
* Prepare high-quality context for AI assistants.  
* Reduce time spent searching for information.  
* Make studying and assignment work significantly more efficient.

---

# **3\. Product Philosophy**

Academic OS owns the data.

Claude owns the reasoning.

Academic OS should never attempt to become an AI assistant.

Claude should never become responsible for storing academic information.

Both systems should have clearly separated responsibilities.

---

# **4\. Scope**

The application focuses exclusively on academic workflows.

Personal productivity features (finance, fitness, habits, etc.) are intentionally outside the scope of Version 1\.

---

# **5\. Course-Centric Organization**

Every piece of academic information should belong to a course whenever possible.

Each course acts as an independent workspace.

Each workspace contains:

* Lecture material  
* Notes  
* Assignments  
* Announcements  
* Deadlines  
* Textbooks  
* Uploaded resources  
* Synced resources  
* Email attachments  
* Course metadata

---

# **6\. Data Sources**

Academic OS should synchronize academic information from multiple sources.

Supported sources include:

## **Google Classroom**

Synchronize:

* Courses  
* Assignments  
* Announcements  
* Attached resources  
* Due dates  
* Course structure

---

## **Gmail**

Synchronize academic emails.

Examples:

* Professor announcements  
* Assignment clarifications  
* Schedule changes  
* Course communication

Emails should be associated with the correct course whenever possible.

---

## **Google Drive (Optional)**

If enabled:

Synchronize selected academic folders and files.

---

## **Local Storage**

Monitor user-selected folders.

Examples:

Downloads

Lecture folders

Semester folders

Imported notes

The application should detect newly added academic files.

---

## **Manual Uploads**

Support importing:

* PDFs  
* PowerPoint presentations  
* Word documents  
* Images  
* ZIP archives (optional)  
* Text files  
* Markdown files

---

# **7\. Handwritten Notes**

Handwritten notes are a first-class feature.

Users should be able to import:

* Photos  
* Scans  
* Phone scans  
* Tablet exports

The application should preserve:

Original image

OCR text

Search index

Both the original scan and extracted text should remain available.

Handwritten notes should become searchable and available to Claude.

---

# **8\. Course Workspace**

Each course should provide:

Overview

Resources

Assignments

Announcements

Notes

Deadlines

Files

Settings

---

# **9\. Unified Resource Library**

Users should never need to remember where a resource originated.

Regardless of whether a resource came from:

Google Classroom

Email

Drive

Downloads

Manual upload

it should appear together inside the course.

---

# **10\. Resource Viewer**

The application should support viewing common academic resources without leaving the application whenever practical.

Examples:

PDF viewer

Image viewer

Markdown viewer

Text viewer

If native viewing is unavailable, the application should open the default external application.

---

# **11\. Notes**

Support:

Typed notes

Rich text (or Markdown, to be decided)

Images

Embedded files

Handwritten note uploads

Notes belong to courses.

Notes should be searchable.

---

# **12\. Deadlines**

Maintain one academic timeline.

Possible entries include:

Assignments

Readings

Quizzes

Labs

Projects

Exams

Manual tasks

Deadlines should be visible:

Globally

Per course

---

# **13\. Dashboard**

The homepage should provide an overview of the current academic state.

Potential widgets include:

Today's upcoming deadlines

Recently added resources

Unread announcements

New assignments

Recently synced items

"What changed today?"

Dashboard contents should prioritize surfacing new or actionable information over displaying static information.

---

# **14\. Search**

Global search should search across:

Courses

Assignments

Lecture slides

PDFs

Textbooks

Notes

Handwritten notes (OCR)

Announcements

Emails

Uploaded resources

Search results should prioritize relevance rather than storage location.

---

# **15\. Academic Database**

Academic OS maintains the canonical academic database.

This database stores:

Course information

Metadata

File locations

Deadlines

Announcements

Assignments

OCR text

Indexes

Relationships originating from trusted sources

The database should remain independent of any AI provider.

---

# **16\. Context Builder**

Academic OS should assemble relevant information for AI requests.

Examples:

Assignment help

Exam revision

Lecture summaries

Concept explanations

Rather than sending all available information, the Context Builder should retrieve the most relevant resources for the requested task.

The Context Builder should not permanently modify academic data based on AI inference.

---

# **17\. Relationships**

Academic OS may store explicit relationships.

Examples include:

Lecture belongs to course

Assignment references lecture

Exam covers lectures

Email references assignment

Relationships should originate from:

Imported metadata

Course structure

Explicit references

User actions

Academic OS should not permanently create relationships based solely on AI inference.

Temporary AI-generated associations may be used during context construction but should not become canonical data.

---

# **18\. Claude Code Integration**

Claude Code acts as the reasoning engine over Academic OS.

Academic OS should maintain documentation and data structures that allow Claude Code to quickly understand:

Course organization

Resource locations

Course metadata

User preferences

Current semester

Directory structure

Academic OS should support initializing a fresh Claude Code conversation without requiring the user to manually explain the project structure or academic organization.

---

# **19\. Course Profiles**

Each course maintains its own AI profile.

Profiles describe how Claude should approach work related to that course.

Examples include:

Preferred explanation style

Preferred level of detail

Reasoning depth

Formatting preferences

Use of mathematical derivations

Citation preferences

These profiles are maintained by Academic OS and supplied to Claude during context construction.

---

# **20\. Claude Responsibilities**

Claude is responsible for reasoning, not storage.

Typical tasks include:

Assignment assistance

Concept explanations

Lecture summaries

Multi-lecture summaries

Study guides

Revision notes

Comparing multiple resources

Answering academic questions

Searching across retrieved academic context

Claude should always operate using the context supplied by Academic OS.

---

# **21\. Future Claude Workflow**

The intended workflow is:

User asks Claude a question.

Academic OS identifies the current course.

Academic OS retrieves relevant resources.

Academic OS provides:

Course profile

Relevant files

Relevant notes

Assignments

Announcements

Extracted handwritten notes

Supporting metadata

Claude performs reasoning.

Claude returns an answer.

Academic OS remains the persistent knowledge platform.

---

# **22\. Out of Scope (Version 1\)**

The following features are explicitly outside the initial scope:

Personal finance

Fitness tracking

Running workouts

Habit tracking

General life calendar

Task management outside academics

Mobile application

Multi-user collaboration

---

# **23\. Success Criteria**

The product is considered successful if it enables the user to:

* Open a single application to access all academic information.  
* Spend minimal time locating course resources.  
* Stop repeatedly uploading the same files to AI assistants.  
* Maintain an organized academic workspace throughout the semester.  
* Seamlessly prepare high-quality context for Claude.  
* Ask academic questions with significantly richer context than standalone AI tools.  
* Complete studying and assignments with less manual overhead and fewer context switches.

---

# **Open Product Questions (To Be Resolved)**

These are not implementation details—they are product decisions that still need to be made as the project evolves:

### **1\. Notes**

* Should notes support Markdown, rich text, or both?  
* Should handwritten annotations be possible directly within the app?

### **2\. Synchronization**

* How frequently should Classroom and Gmail sync?  
* Should synchronization be manual, automatic, or configurable?

### **3\. Offline Behavior**

* Which features should remain fully functional without an internet connection?  
* How should synchronization conflicts be handled after reconnecting?

### **4\. Course Lifecycle**

* How are semesters archived?  
* Should old courses remain searchable by default?

### **5\. AI Provider Independence**

* While the initial target is Claude Code, should the data structures and documentation remain generic enough to support future reasoning engines without redesigning the platform?

---


