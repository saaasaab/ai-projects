Project:
- VS code extension for writers. 

Business Requirements Document (BRD)
Working Title: Semantic Writing Layer for Google Docs
1. Product Overview

The product is a Google Docs extension/application designed for fiction writers and worldbuilders. It transforms a standard Google Doc into a semantically structured writing environment where important story concepts are represented as persistent entities rather than plain text.

Writers can reference structured entities such as characters, locations, religions, events, organizations, and ideas directly inside the manuscript using lightweight inline smart chips.

The primary goal of the product is to help writers organize large and complex stories without chaos while maintaining a clean, distraction-free writing experience.

The product is intentionally NOT an AI writing assistant.

2. Product Vision

C:Clara

Provide writers with:

semantic organization
persistent worldbuilding structures
easy navigation
effortless refactoring
centralized lore management

…while preserving the simplicity and flexibility of writing in Google Docs.

The writing document remains the primary creative surface.

The extension adds a structured “knowledge layer” on top of the document.

3. Core Product Principles
3.1 Writer-First Experience

The extension should never interrupt creative flow.

3.2 Lightweight Inline Experience

The manuscript should remain visually clean.

References should appear as elegant smart chips/pills instead of noisy markup.

3.3 Structure Without Complexity

The system should provide organization without requiring users to manage complicated graphs or databases.

3.4 No AI Generation

The product does not generate prose or story content.

The product focuses exclusively on:

organization
navigation
consistency
semantic references
4. Initial Scope (V1)
4.1 Project Scope

A single Google Document represents a single story/project.

Multiple tabs/sections within the same document share the same entity database.

Cross-document syncing is OUT OF SCOPE for V1.

5. Entity System
5.1 Supported Entity Types
Prefix	Type
C:	Character
L:	Location
R:	Religion
I:	Idea
E:	Event
O:	Organization
6. Inline Semantic References
6.1 Typing Flow

When the user types a supported prefix:

Example:

C:

The extension opens an autocomplete/intellisense menu.

As the user types:

C:Claire

the system filters matching entities.

6.2 Autocomplete Behavior

Autocomplete should:

show matching entities
support multi-word entities
support long names
update results in real time

Example:

C:Claire von Strouss
6.3 Entity Creation Flow

If no matching entity exists:

The autocomplete menu should display:

Create new character "Claire"

Selecting this:

creates the entity record
inserts the semantic smart chip into the document
7. Smart Chip Behavior
7.1 Visual Representation

Entities should render as styled smart chips/pills inside the document.

The document should not visibly display raw syntax like:

C:Claire

Instead, users see a polished inline chip.

7.2 Chip Characteristics

Chips must:

behave atomically
be selectable
support copy/paste
maintain clean visual formatting
7.3 Editing Behavior

If the user backspaces or partially edits a chip:

the entire chip is deleted atomically

The user can recreate it by typing the prefix again.

8. Copy/Paste Behavior
8.1 Within Same Document

Copy/paste preserves semantic entity references.

8.2 Into Another Document

When pasted into another document:

references degrade into plain text syntax

Example:

C:Claire

The destination document may:

match existing entities
offer autocomplete/intellisense
allow creation of new entities
8.3 Broken References

Broken references degrade gracefully into plain text.

Example:

C:Claire

No unresolved/broken UI states should appear.

9. Side Panel Experience
9.1 Primary Navigation Model

Clicking a chip opens a right-side contextual panel.

This panel becomes the primary entity management interface.

9.2 Side Panel Responsibilities

The side panel should display:

entity name
entity type
notes
background information
timeline notes
lore
metadata
custom text sections
9.3 Panel Philosophy

The side panel acts as:

a living wiki
contextual reference system
worldbuilding notebook

without interrupting the manuscript.

10. Entity Architecture
10.1 Stable IDs

Entities must use persistent internal IDs independent from display names.

This allows:

safe renaming
stable references
future extensibility
10.2 Renaming

Changing an entity’s name:

updates all references throughout the document automatically

Example:

Claire → Claire von Strouss

All chips update globally.

11. Data Model Requirements

Each entity should minimally support:

Entity {
  id: string
  type: EntityType
  displayName: string
  notes: string
  createdAt: Date
  updatedAt: Date
}

Future extensibility should allow:

timelines
aliases
metadata
tags
custom fields
12. Search & Navigation
12.1 Reference Discovery

Users should be able to:

find all references to an entity
navigate between usages
12.2 Entity Browsing

The side panel should support:

browsing all entities
filtering by type
searching by name
13. Non-Goals (V1)

The following are intentionally OUT OF SCOPE:

AI writing generation
AI summaries
relationship graphs
automatic lore inference
cross-document syncing
multiplayer collaboration systems
publishing/export systems
advanced analytics
automatic contradiction detection
14. UX Goals

The experience should feel:

fast
invisible
reliable
lightweight
elegant
writer-focused

The extension should feel like:

“Google Docs gained memory.”

15. Suggested Technical Architecture
Frontend
Google Docs Add-on
Google Workspace APIs
Sidebar UI
Inline semantic parsing layer
Data Layer

Possible options:

local document metadata
Firebase
Supabase
Google Drive app data
Parsing Engine

Responsibilities:

detect prefixes
manage chips
maintain stable entity references
synchronize rename operations
16. Future Expansion Opportunities

Potential future features:

cross-document projects
exportable story bible
timeline visualization
character appearance tracking
semantic search
story map visualization
offline desktop app
Scrivener migration
Obsidian synchronization
17. Product Positioning
Core Positioning Statement

A semantic worldbuilding layer for Google Docs that helps writers organize massive stories without chaos.

18. Target Audience

Primary users:

fantasy writers
sci-fi writers
novelists
lore-heavy storytellers
serialized fiction authors
tabletop RPG worldbuilders
19. Key User Outcome

Primary emotional outcome:

“I can organize massive stories without chaos.”