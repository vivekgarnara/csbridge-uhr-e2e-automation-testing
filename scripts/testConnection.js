import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DbAssertions } from '../tests/utils/dbAssertions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testConnection() {
  const activeDbPath = path.resolve(__dirname, '../tests/config/activeDb.json');
  
  if (!fs.existsSync(activeDbPath)) {
    console.error('Error: activeDb.json not found. Please ensure database configuration is set.');
    process.exit(1);
  }

  try {
    const activeSession = JSON.parse(fs.readFileSync(activeDbPath, 'utf8'));
    const dbConfig = activeSession.dbConfig;
    
    console.log(`Connecting to ${dbConfig.type} database at ${dbConfig.host}:${dbConfig.port}...`);
    
    const dbAssertions = new DbAssertions(dbConfig);
    
    let query;
    if (dbConfig.type === 'oracle') {
      query = 'SELECT 1 FROM DUAL';
    } else {
      query = 'SELECT 1';
    }

    const result = await dbAssertions.query(query);
    console.log('Connection Successful!');
    console.log('Query Result:', result);
    
  } catch (error) {
    console.error('Connection Failed!');
    console.error(error.message);
    process.exit(1);
  }
}

testConnection();
