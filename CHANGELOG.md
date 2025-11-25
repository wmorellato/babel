# Changelog

## [1.12.0] - 2025-11-24

### Added

- Git management for stories. Every 300 words receive a new commit. Option to squash commits made on the same day.
- Markdown comments.
- Showing on status bar: words written on the current day.

## [1.8.0] - 2022-??-??

### Added

- Counting words when hovering over a text selection.

## [1.7.0] - 2022-??-??

### Added

- Activity view showing which stories were changed and how many words were written on any given day.

## [1.6.0] - 2021-09-18

### Changed

- The status on the right of a story's title was changed to show if the story was revised/eddited (○) and translated (●). I changed this as I was getting lost on which ones were ready for submission. It used to show the number of versions.

## [1.5.1] - 2021-05-29

### Fixed

- Backup feature was not functioning as I forgot to uncomment it before releasing 1.5.0...

## [1.5.0] - 2021-04-13

### Added

- Activity tracking.
### Fixed

- Issue when counting words for a given document.
## [1.4.1] - 2020-08-20

### Fixed

- Fixed lower case comparison when reading backup period from Settings.

## [1.4.0] - 2020-08-20

### Added

- Backup feature.
- Google Drive integration for backups.
- Backup history view to Story Explorer.

### Changed

- Extension icon and theme in Marketplace.

## [1.3.0] - 2020-05-31

### Added

- Command to include Markdown metadata on the top of the file based on the selected template.

### Changed

- The replacement of keywords in the document now uses the information provided from the header.

## [1.2.0] - 2020-05-21

### Changed

- Changed the exporter implementation to one that supports italics and other features.
- Changed `.travis.yml` build trigger.

### Fixed

- Exporter button showing up on editor for every file.

## [1.1.1] - 2020-05-18

### Fixed

- Story icons did not show up in Linux as the file names as case sensitive.

## [1.1.0] - 2020-05-10

### Added

- Export feature.
    - This feature is still experimental.
    - Currently exporting to Shunn's manuscript format, Mafagafo's (Faísca) format and Trasgo's format.
- Author information settings.
    - Basic information as author's name, pen name etc.

### Removed

- Option to copy contents from draft when creating new version. Needs to fix some issues first.

### Fixed

- Issue opening versions with names containing spaces.
- Issue renaming some versions.

## [1.0.0] - 2020-05-06

### Added

- Story explorer.
- Creation, renaming, removal os stories and versions.
- Story and versions metadata.
- Database.
- Word count monitoring.
