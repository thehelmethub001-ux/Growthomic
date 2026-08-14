#!/bin/bash

SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmenN1cnNqdWNocmdhd3pzbHV1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDM3MDg0NSwiZXhwIjoyMDY1OTQ2ODQ1fQ.dYgxo4Q2U7MHEX8_tHZ6mfePiJX7XmEPOxqcBdJoXEM"

URL="https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/embed-products"
MAX_RETRIES=60
TOTAL_PROCESSED=0
TOTAL_ERRORS=0
CALLS=0

echo "Starting embedding process..."

for ((i=1; i<=MAX_RETRIES; i++)); do
    echo "Iteration $i of $MAX_RETRIES..."
    
    # Send POST request
    RESPONSE=$(curl -s -X POST "$URL" \
        -H "Authorization: Bearer $SERVICE_KEY" \
        -H "Content-Type: application/json")
    
    echo "Response: $RESPONSE"
    CALLS=$i
    
    # Check if we are done
    if echo "$RESPONSE" | grep -q "All images already embedded"; then
        echo "DONE - all images embedded"
        break
    fi
    
    # Try to extract processed count and add to total
    PROCESSED=$(echo "$RESPONSE" | grep -o '"processed":\s*[0-9]*' | awk -F':' '{print $2}' | tr -d ' ')
    if [ ! -z "$PROCESSED" ]; then
        TOTAL_PROCESSED=$((TOTAL_PROCESSED + PROCESSED))
    fi
    
    # Try to extract error count
    ERRORS=$(echo "$RESPONSE" | grep -o '"errors":\s*[0-9]*' | awk -F':' '{print $2}' | tr -d ' ')
    if [ ! -z "$ERRORS" ]; then
        TOTAL_ERRORS=$((TOTAL_ERRORS + ERRORS))
    fi
    
    # Sleep before next request
    if [ $i -lt $MAX_RETRIES ]; then
        sleep 5
    fi
done

echo "----------------------------------------"
echo "Summary:"
echo "Total calls made: $CALLS"
echo "Total processed: $TOTAL_PROCESSED"
echo "Total errors: $TOTAL_ERRORS"
echo "----------------------------------------"
