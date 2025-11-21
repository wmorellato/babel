# Markdown Comments Feature

This extension now supports inline comments in markdown files, similar to Google Docs!

## Features

### Add Comments
- Select any text in a markdown file
- Right-click and select "Add Comment" or press `Ctrl+Shift+M` (Mac: `Cmd+Shift+M`)
- Enter your comment in the input box
- The selected text will be tagged with `[a]`, `[b]`, `[c]`, etc.

### View Comments
- Hover over any `[x]` tag to see the comment
- The hover popup shows:
  - The original selected text
  - The comment text
  - Edit and Delete buttons

### Edit Comments
- Hover over a comment tag and click "Edit"
- Or place cursor on a tag and use the command palette: "Comments: Edit Comment"
- Update the comment text

### Delete Comments
- Hover over a comment tag and click "Delete"
- Or place cursor on a tag and use the command palette: "Comments: Delete Comment"
- Confirm the deletion

### Auto-cleanup
- Orphan tags (comments without inline references) are automatically removed when you save the file

## Comment Format

Comments follow the Google Docs export format:

```markdown
This is some text with a comment[a] and another one[b].

More text here.




[a]This is the first comment
>>This is some text with a comment

[b]This is the second comment
>>and another one
```

The `>>` prefix stores the originally selected text for reference.

## Example Usage

1. Open a markdown file
2. Select text: "He swirled his glass"
3. Right-click → "Add Comment"
4. Enter: "Great imagery!"
5. Result: "He swirled his glass[a]"

At the end of the document:
```
[a]Great imagery!
>>He swirled his glass
```

## Keyboard Shortcuts

- `Ctrl+Shift+M` (Mac: `Cmd+Shift+M`): Add comment to selected text

## Notes

- Comments are only available in markdown files
- Comment tags are automatically generated as `[a]`, `[b]`, `[c]`, etc.
- Tags are decorated with a subtle background and a 💬 icon
- Comments are preserved when exporting to other formats
- Compatible with Google Docs export format
