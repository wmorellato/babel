# Babel [![Build Status](https://travis-ci.com/wmorellato/babel.svg?branch=master)](https://travis-ci.com/wmorellato/babel)

Babel is a Visual Studio Code extension for writers and developers. It helps you manage your pieces and write without distractions, focusing on what really matters: your story. Using *versions*, you can keep track of your drafts, revisions, translations and submissions on Babel view. Upcoming features include backups of your stories in cloud storage providers, language statistics, exporting to custom manuscript formats and integration with [The Grinder](https://thegrinder.diabolicalplots.com/).

![](images/img1.png)

## Usage

1. Install Babel.
2. Create a folder to store your stories.
3. Open this folder with VSCode (either using the context menu in your file system explorer or directly from VSCode).
4. Click Babel icon in the activity bar to active the extension. Babel will ask you if you want to use the current folder to hold your stories. Choose yes.
5. Create a new story. A *draft* version will be automatically created.
6. Start writing.

## Exporting

> :warning: **This feature is experimental!** Please, review the output .docx file and fix any badly formatted paragraphs.

It is possible to export a version to some of the provided templates. This feature is still in experimental stage and there are known issues:

- Paragraphs are not indented.
- No support for *italics*
- I had some issues with Google Docs not recognizing line breaks.

I am currently working on my own implementation of exporting to .docx to fix the issues above, but this might take some time. Try it and see if it works for you.

Babel is able to export to the following formats:

- [Shunn's Manuscript Format](https://www.shunn.net/format/templates.html)
- [Revista Mafagafo Faísca Template](https://mafagaforevista.com.br/submissoesfaisca/)
- [Revista Trasgo Template](https://trasgo.com.br/envie-o-seu-material)

## Settings

- `stories.workspace.removeFiles`: if set, the extension will also remove files when removing a story or a version from the workspace. Set with care.
- `stories.authorInformation.usePenName`: if set, the "Pen name" configuration will be used when exporting stories.
- `stories.authorInformation.name`: author's name.
- `stories.authorInformation.penName`: author's pen name.
- `stories.authorInformation.email`: author's e-mail.
- `stories.authorInformation.country`: author's country.

## Upcoming features

- Integration with OneDrive, Google Drive and Dropbox to backup stories.
- Linguistic analysis of texts.
- Export to rtf, docx and pdf formats in common submission templates.
- Integration with *zen mode* in VSCode.
- Integration with [The Grinder](https://thegrinder.diabolicalplots.com/).
