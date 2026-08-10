const fs = require('fs');
const file = 'e:\\Growthomic lite for mahi vai\\supabase\\functions\\queue-processor\\index.ts';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// Lines 476-481 (0-indexed: 475-480) are stray template text - remove them
// and insert proper else block after line 475 (0-indexed: 474)
const elseBlock = [
  '              } else {',
  '                let availableVariationsText = "";',
  '                if (!preMatchedVariationId && inStockVarsInfo) {',
  '                  availableVariationsText = inStockVarsInfo;',
  '                }',
  '                messageText = `[SYSTEM_INSTRUCTION: Customer sent an image of a product. Target Product: ${fullProductName} (Price: ${topMatch.sale_price || topMatch.regular_price}). detectedProductId = "${topMatch.id}" set koro. ${availableVariationsText} Reply naturally in Bengali. If color not confirmed, ask for screenshot first before any order.] ` + (messageText || "");',
  '              }',
];

// Remove lines at index 475-480 (which are lines 476-481 in 1-indexed)
const newLines = [...lines.slice(0, 475), ...elseBlock, ...lines.slice(481)];
fs.writeFileSync(file, newLines.join('\n'), 'utf8');
console.log('Done. Total lines:', newLines.length);
