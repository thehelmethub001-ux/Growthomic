const stockPhrases = ["স্টকে আছে", "এভেইলেবল আছে", "পাওয়া যাচ্ছে", "এভেইলেবল", "স্টকে"];
const roboticPhrases = ["মিলেছে", "বিশ্লেষণ করে দেখলাম", "সনাক্ত করা হয়েছে", "ম্যাচ করেছে", "শনাক্ত করা হয়েছে", "মিল পেয়েছি", "মিল পাওয়া গেছে", "মিল পাওয়া যাচ্ছে"];

function runFilter(reply: string, isInStock: boolean) {
    let modifiedReply = reply;
    let hasRobotic = false;
    for (const p of roboticPhrases) {
      if (modifiedReply.includes(p)) {
        hasRobotic = true;
        modifiedReply = modifiedReply.split(p).join("");
      }
    }

    let hasStockPhrase = false;
    for (const p of stockPhrases) {
      if (modifiedReply.includes(p)) {
        hasStockPhrase = true;
        break;
      }
    }

    if (hasStockPhrase && isInStock) {
        for (const p of stockPhrases) {
            modifiedReply = modifiedReply.split(p).join("");
        }
    }

    if (modifiedReply !== reply) {
        modifiedReply = modifiedReply.replace(/\s+/g, ' '); // collapse spaces
        modifiedReply = modifiedReply.replace(/ ,/g, ','); // fix commas
        modifiedReply = modifiedReply.replace(/ \./g, '.'); // fix periods
        modifiedReply = modifiedReply.replace(/ ।/g, '।'); // fix dari
        modifiedReply = modifiedReply.replace(/, \./g, '.');
        modifiedReply = modifiedReply.replace(/, ।/g, '।');
        modifiedReply = modifiedReply.replace(/[,\s]+$/, '');
        return modifiedReply.trim();
    }
    return reply;
}

const testCases = [
  { text: "স্যার, আপনার পাঠানো ছবিটির সাথে আমাদের 'Spark Metro Solid' মডেলটির মিল পাওয়া গেছে। এটি আমাদের স্টকে আছে। এর দাম ২৫০০ টাকা।", inStock: true },
  { text: "স্যার, আপনার পাঠানো ছবিটির সাথে আমাদের 'Spark Metro Solid' মডেলটির মিল পাওয়া গেছে। এটি আমাদের স্টকে আছে।", inStock: false }, // if out of stock, should strip robotic but keep stock phrase
  { text: "ছবিটি বিশ্লেষণ করে দেখলাম এটি Spark X25। মডেলটি আমাদের কাছে এভেইলেবল আছে।", inStock: true },
  { text: "স্যার, মডেলটি সনাক্ত করা হয়েছে। কিন্তু এই কালারটি বর্তমানে এভেইলেবল নেই।", inStock: false }, // out of stock, keep "এভেইলেবল" because the sentence says "এভেইলেবল নেই" (wait, our phrase is "এভেইলেবল আছে", but wait, "এভেইলেবল" is in the stock list. Let's see how it behaves)
];

testCases.forEach((t, i) => {
    console.log(`\nExample ${i+1} (In Stock: ${t.inStock}):`);
    console.log(`Original: ${t.text}`);
    console.log(`Modified: ${runFilter(t.text, t.inStock)}`);
});
