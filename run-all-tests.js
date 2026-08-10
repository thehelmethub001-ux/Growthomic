const fs = require('fs');

async function runTests() {
  const allResults = [];
  let offset = 0;
  const limit = 3;
  let totalTested = 0;
  let successCount = 0;
  let failCount = 0;
  
  while (true) {
    console.log(`Running chunk offset=${offset}, limit=${limit}...`);
    
    const res = await fetch("https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/test-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset, limit })
    });
    
    if (!res.ok) {
        console.log(`Failed HTTP ${res.status}: ${await res.text()}`);
        break;
    }
    
    const data = await res.json();
    console.log(`Chunk done. Tested: ${data.totalTested}, Success: ${data.successCount}, Fail: ${data.failCount}`);
    
    if (data.totalTested === 0) break;
    
    allResults.push(...data.results);
    totalTested += data.totalTested;
    successCount += data.successCount;
    failCount += data.failCount;
    
    offset += limit;
    
    if (data.totalTested < limit) {
      break; // reached end
    }
    
    console.log("Waiting 15 seconds to avoid Gemini rate limits (15 RPM)...");
    await new Promise(r => setTimeout(r, 15000));
  }
  
  const finalReport = {
    totalTested,
    successCount,
    failCount,
    results: allResults
  };
  
  fs.writeFileSync("final_test_results.json", JSON.stringify(finalReport, null, 2));
  console.log("All done! Results saved to final_test_results.json");
}

runTests().catch(console.error);
