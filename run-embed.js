const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmenN1cnNqdWNocmdhd3pzbHV1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDM3MDg0NSwiZXhwIjoyMDY1OTQ2ODQ1fQ.dYgxo4Q2U7MHEX8_tHZ6mfePiJX7XmEPOxqcBdJoXEM";
const url = "https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/embed-products";

async function main() {
    let calls = 0;
    let totalProcessed = 0;
    let totalErrors = 0;
    const maxCalls = 60;

    console.log("Starting embedding process...");

    for (let i = 1; i <= maxCalls; i++) {
        calls = i;
        console.log(`\nIteration ${i} of ${maxCalls}...`);
        
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });
            
            const text = await res.text();
            console.log("Response:", text);

            if (text.includes("All images already embedded")) {
                console.log("DONE - all images embedded");
                break;
            }

            try {
                const json = JSON.parse(text);
                if (json.processed) totalProcessed += json.processed;
                if (json.errors) totalErrors += json.errors;
            } catch (e) {}

        } catch (err) {
            console.error("Fetch failed:", err.message);
        }

        if (i < maxCalls) {
            console.log("Waiting 5 seconds...");
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    console.log("\n----------------------------------------");
    console.log("Summary:");
    console.log("Total calls made:", calls);
    console.log("Total processed:", totalProcessed);
    console.log("Total errors:", totalErrors);
    console.log("----------------------------------------");
}

main();
