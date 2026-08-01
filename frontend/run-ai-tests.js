const fs = require('fs');

async function runTests() {
  const allResults = [];
  let offset = 0;
  const limit = 2; // AI text generation takes time and hits rate limits faster, let's process 2 at a time
  let totalTested = 0;
  
  while (true) {
    console.log(`Running chunk offset=${offset}, limit=${limit}...`);
    
    try {
      const res = await fetch("https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/test-ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset, limit })
      });
      
      if (!res.ok) {
          console.log(`Failed HTTP ${res.status}: ${await res.text()}`);
          break;
      }
      
      const data = await res.json();
      console.log(`Chunk done. Tested: ${data.totalTested}`);
      
      if (data.totalTested === 0) break;
      
      allResults.push(...data.results);
      totalTested += data.totalTested;
      
      // Save partial results immediately
      fs.writeFileSync("final_ai_responses.json", JSON.stringify({ totalTested, results: allResults }, null, 2));
      
      offset += limit;
      
      if (data.totalTested < limit) {
        break; // reached end
      }
      
      console.log("Waiting 15 seconds to avoid Gemini rate limits...");
      await new Promise(r => setTimeout(r, 15000));
    } catch(err) {
      console.log("Network error, retrying in 10s...", err.message);
      await new Promise(r => setTimeout(r, 10000));
      // do not increment offset, just retry the same chunk
    }
  }
  
  const finalReport = {
    totalTested,
    results: allResults
  };
  
  fs.writeFileSync("final_ai_responses.json", JSON.stringify(finalReport, null, 2));
  console.log("All done! Results saved to final_ai_responses.json");
}

runTests().catch(console.error);
