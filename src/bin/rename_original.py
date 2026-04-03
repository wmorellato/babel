#!/usr/bin/env python3
import sys
import json
import subprocess
from pathlib import Path
from typing import Optional


class GitBranchRenamer:
    def __init__(self, old_name: str, new_name: str):
        self.old_name = old_name
        self.new_name = new_name
    
    def rename_in_repo(self, repo_path: Path) -> bool:
        """Rename branch in a single repository. Returns True if successful."""
        try:
            subprocess.run(
                ["git", "-C", str(repo_path), "branch", "-m", self.old_name, self.new_name],
                check=True,
                capture_output=True,
                text=True
            )
            print(f"Renamed branch: {repo_path} → {self.old_name} to {self.new_name}")
            return True
        except subprocess.CalledProcessError:
            return False


class FileRenamer:
    def __init__(self, old_name: str, new_name: str):
        self.old_name = old_name
        self.new_name = new_name
    
    def rename_in_directory(self, root_path: Path) -> None:
        """Rename files recursively."""
        for old_file in root_path.rglob(self.old_name):
            new_file = old_file.parent / self.new_name
            old_file.rename(new_file)
            print(f"Renamed: {old_file} → {new_file}")


class DraftDeduplicator:
    def __init__(self, database_path: str):
        self.database_path = Path(database_path)
        self.data = self._load_database()
        self.stories_by_id = {story["id"]: story for story in self.data.get("stories", [])}
    
    def _load_database(self) -> dict:
        """Load JSON database."""
        try:
            with open(self.database_path) as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"Error loading database: {e}")
            sys.exit(1)
    
    def _get_story_title(self, story_id: str) -> str:
        """Get story title by ID."""
        story = self.stories_by_id.get(story_id)
        return story["title"] if story else "Unknown"
    
    def find_duplicate_drafts(self) -> dict[str, list]:
        """Find all stories with multiple draft versions. Returns {storyId: [versions]}."""
        drafts_by_story = {}
        
        for version in self.data.get("versions", []):
            if version["name"] == "draft":
                story_id = version["storyId"]
                if story_id not in drafts_by_story:
                    drafts_by_story[story_id] = []
                drafts_by_story[story_id].append(version)
        
        return {
            story_id: versions
            for story_id, versions in drafts_by_story.items()
            if len(versions) > 1
        }
    
    def dry_run(self) -> None:
        """Show what would be deleted without making changes."""
        duplicates = self.find_duplicate_drafts()
        
        if not duplicates:
            print("No duplicate draft versions found.")
            return
        
        print("=== DRY RUN: Versions to be deleted ===\n")
        
        for story_id, versions in duplicates.items():
            story_title = self._get_story_title(story_id)
            
            # Sort by creation date, newest first
            sorted_versions = sorted(versions, key=lambda v: v["created"], reverse=True)
            newest = sorted_versions[0]
            to_delete = sorted_versions[1:]
            
            print(f"Story: {story_title} (ID: {story_id})")
            print(f"  Keeping (newest): {newest['id']} (created: {newest['created']})")
            
            for version in to_delete:
                print(f"  DELETE: {version['id']} (created: {version['created']})")
            print()
    
    def deduplicate(self) -> None:
        """Remove older duplicate draft versions."""
        duplicates = self.find_duplicate_drafts()
        
        if not duplicates:
            print("No duplicate draft versions found.")
            return
        
        versions_to_delete = []
        
        for story_id, versions in duplicates.items():
            sorted_versions = sorted(versions, key=lambda v: v["created"], reverse=True)
            versions_to_delete.extend(sorted_versions[1:])
        
        # Remove versions
        original_count = len(self.data["versions"])
        self.data["versions"] = [
            v for v in self.data["versions"]
            if v["id"] not in {v["id"] for v in versions_to_delete}
        ]
        
        # Update story version lists
        deleted_ids = {v["id"] for v in versions_to_delete}
        for story in self.data["stories"]:
            story["versions"] = [v for v in story["versions"] if v not in deleted_ids]
        
        # Save
        with open(self.database_path, "w") as f:
            json.dump(self.data, f, indent=2)
        
        print(f"Removed {original_count - len(self.data['versions'])} duplicate draft version(s)")


class DirectoryProcessor:
    def __init__(self, root_directory: str):
        self.root_path = self._validate_directory(root_directory)
    
    def _validate_directory(self, directory: str) -> Path:
        """Validate that directory exists."""
        root_path = Path(directory)
        if not root_path.is_dir():
            print(f"Error: '{directory}' is not a valid directory")
            sys.exit(1)
        return root_path
    
    def process(self, file_renamer: FileRenamer, branch_renamer: GitBranchRenamer) -> None:
        """Process all subdirectories."""
        file_renamer.rename_in_directory(self.root_path)
        
        for subdir in self.root_path.iterdir():
            if subdir.is_dir() and (subdir / ".git").exists():
                branch_renamer.rename_in_repo(subdir)


def main():
    if len(sys.argv) < 2:
        print("Usage: python script.py <command> [args]")
        print("Commands:")
        print("  rename <directory>              Rename original.md files and git branches")
        print("  deduplicate-drafts <json_file>  Show duplicates (dry run)")
        print("  deduplicate-drafts <json_file> --apply  Remove duplicate draft versions")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "rename":
        if len(sys.argv) != 3:
            print("Usage: python script.py rename <directory>")
            sys.exit(1)
        
        file_renamer = FileRenamer("Revisao.md", "revisao.md")
        file_renamer = FileRenamer("revisao.md", "revision.md")
        branch_renamer = GitBranchRenamer("revisao", "revision")
        processor = DirectoryProcessor(sys.argv[2])
        processor.process(file_renamer, branch_renamer)
    
    elif command == "deduplicate-drafts":
        if len(sys.argv) < 3:
            print("Usage: python script.py deduplicate-drafts <json_file> [--apply]")
            sys.exit(1)
        
        deduplicator = DraftDeduplicator(sys.argv[2])
        
        if len(sys.argv) > 3 and sys.argv[3] == "--apply":
            deduplicator.deduplicate()
        else:
            deduplicator.dry_run()
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()