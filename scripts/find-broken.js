const fs = require('fs');
const path = require('path');
const { BabelDb } = require('../src/database');

// Test class with the function you want to debug
class ActivityChartUpdater {
  constructor(dbData) {
    this.db = new BabelDb(dbData);
    this.view = null; // No webview in debug mode
  }

  updateActivityChart() {
    console.log('\n📊 Starting updateActivityChart...\n');
    
    const actHistory = this.db.getActivityHistory();
    console.log(`✓ Retrieved ${actHistory.length} activity history items\n`);

    actHistory.forEach((element, index) => {
      console.log(`\n--- Processing item ${index + 1} ---`);
      console.log('📅 Date:', element.date);
      console.log('📝 Entries count:', element.entries?.length || 0);
      console.log('📝 Title:', element.entries?.length || 0);

      try {
        element.total = element.entries.reduce((acc, entry) => {
          console.log(`  └─ Entry: storyId="${entry.storyId}", wordCount=${entry.wordCount}`);
          return acc + entry.wordCount;
        }, 0);
        console.log('✓ Total calculated:', element.total);

        element.details = element.entries.map((entry) => {
          console.log(`  └─ Looking up story with ID: "${entry.storyId}"`);
          const story = this.db.getStoryById(entry.storyId);
          console.log(`    └─ Found story: "${story.title}"`);
          
          return { 
            name: story.title, 
            date: element.date, 
            value: entry.wordCount 
          };
        });
        console.log('✓ Details mapped successfully');

      } catch (error) {
        console.error(`\n❌ Error processing item ${index + 1}:`);
        console.error('Error message:', error.message);
        console.error('Stack:', error.stack);
        throw error;
      }
    });

    console.log('\n\n✅ updateActivityChart completed successfully!');
    return actHistory;
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node debug-database.js <path-to-json-file>');
    console.error('Example: node debug-database.js ./database.json');
    process.exit(1);
  }

  const jsonFilePath = path.resolve(args[0]);

  if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ File not found: ${jsonFilePath}`);
    process.exit(1);
  }

  console.log(`📂 Loading database from: ${jsonFilePath}\n`);

  try {
    const updater = new ActivityChartUpdater(jsonFilePath);
    const result = updater.updateActivityChart();

    console.log('\n\n📋 Final result:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('❌ JSON Parse Error:', error.message);
      console.error('Make sure your JSON file is valid');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

main();