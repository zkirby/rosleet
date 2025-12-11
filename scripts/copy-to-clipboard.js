import { readFileSync } from 'fs';
import clipboardy from 'clipboardy';

const outputFile = 'dist/rosalind-leetcode-style.user.js';

try {
  const content = readFileSync(outputFile, 'utf-8');
  clipboardy.writeSync(content);
  console.log('✓ Built userscript copied to clipboard!');
  console.log(`  File: ${outputFile} (${content.length} chars)`);
} catch (error) {
  console.error('Failed to copy to clipboard:', error.message);
  process.exit(1);
}
