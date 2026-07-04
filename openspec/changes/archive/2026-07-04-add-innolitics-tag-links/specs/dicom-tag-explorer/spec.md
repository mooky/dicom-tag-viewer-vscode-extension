## ADDED Requirements

### Requirement: Detail pane shows a DICOM standard reference link
When the selected tag has a resolved DICOM standard reference link, the detail pane SHALL display it as a clickable link. When no reference link could be resolved for the selected tag, the detail pane SHALL omit the link without showing an error.

#### Scenario: Selected tag has a resolved reference link
- **WHEN** a user selects a tag for which a reference link was resolved
- **THEN** the detail pane shows a link to that reference page alongside the tag's other details

#### Scenario: Selected tag has no resolved reference link
- **WHEN** a user selects a tag for which no reference link could be resolved (e.g. a private tag, or a tag outside the resolved CIOD's declared attributes)
- **THEN** the detail pane shows the tag's other details with no reference link and no error indication
