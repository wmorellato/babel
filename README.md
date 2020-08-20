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

> Please, review the output .docx file to fix any badly formatted text and to insert missing information about yourself.

You can easily export your versions to one of the provided formats. To do so, search for the export button next to each version name (you need to hover your mouse over the version row in the Story Explorer).

The author's information from Babel's settings will be used to fill some of the fields in the output document.

### Italics

To include *italics* in the output document, use the default markdown syntax (\*italics*\).

### Paragraphs

To be able to correctly export the paragraphs, you need to separate paragraphs with a blank line. **This includes dialog lines**. Here's how an excerpt of *Lord of the Rings* should be formatted:

```
It was dark, and white stars were shining, when Frodo and his companions came at last to the Greenway-crossing and drew near the village. They came to the West-gate and found it shut, but at the door of the lodge beyond it, there was a man sitting. He jumped up and fetched a lantern and looked over the gate at them in surprise.

"What do you want, and where do you come from?' he asked gruffly"

"We are making for the inn here,' answered Frodo. 'We are journeying east and cannot go further tonight."
```

### Templates

Babel is able to export to the following formats:

- [Shunn's Manuscript Format](https://www.shunn.net/format/templates.html)
- [Revista Mafagafo Faísca Template](https://mafagaforevista.com.br/submissoesfaisca/)
- [Revista Trasgo Template](https://trasgo.com.br/envie-o-seu-material)

The output docx files for *The Library of Babel*, from Jorge Luis Borges, can be seen below.

Shuun                        | Mafagafo Faísca              | Trasgo
:---------------------------:|:----------------------------:|:----------------------------:
![](images/shunn-export.png) |![](images/faisca-export.png) |![](images/trasgo-export.png) 

## Backups

Babel now stores backups of your workspace to ensure that, in case shit happens, your stories will be safe. You can configure the period of backup creations (daily, weekly or monthly), where they should be stores in your local computer and, optionally, save them on Google Drive.

To enable Google Drive integration, you have to set the `stories.backup.cloudBackup.googleDrive` option in Settings, then restart VSCode to trigger the authentication/authorization routine. I use [OAuth2](https://developers.google.com/identity/protocols/oauth2) to access Google Drive API and perform the backups.

> TODO: The page displayed after successful authentication is terrible. I'll make it better someday.

> :warning: **Important** Babel does not ask or store your username and password to perform backups. We access Google API using an authentication token, which is stored in your workspace folder in the file `.token`. Also, the permissions requested by Babel to store backups only allow the extension to access Babel's own files; however, **don't share the token file with anyone**, unless you don't mind your stories being accessible to others.

## Settings

- `stories.workspace.removeFiles`: if set, the extension will also remove files when removing a story or a version from the workspace. Set with care.
- `stories.authorInformation.usePenName`: if set, the "Pen name" configuration will be used when exporting stories.
- `stories.authorInformation.name`: author's name.
- `stories.authorInformation.penName`: author's pen name.
- `stories.authorInformation.email`: author's e-mail.
- `stories.authorInformation.country`: author's country.
- `stories.backup.period`: period between backup operations.
- `stories.backup.cloudBackup.googleDrive`: allow Google Drive integration.
- `stories.backup.localBackup.path`: local path to store backup files.

### Markdown metadata

You can insert Markdown metadata as a header on the top of each version file to use its values instead of the provided in settings. If a field used by the template is missing or its value is empty, then we try to get the value from settings.

To insert the header in a version file, right-click on the editor and click the option `Insert header`. You will be provided with a list of the available templates. The header will be generated based on the fields required by this template.

## Upcoming features

- Integration with OneDrive and Dropbox to backup stories.
- Linguistic analysis of texts.
- Integration with [The Grinder](https://thegrinder.diabolicalplots.com/).
