const url = "https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/embed-products";

async function run() {
  while (true) {
    console.log("Fetching next batch...");
    try {
      const res = await fetch(url, { method: "POST" });
      const text = await res.text();
      console.log("Response:", text);
      if (text.includes("All products are already embedded")) {
        console.log("Done!");
        break;
      }
    } catch (err) {
      console.error(err);
    }
  }
}

run();
