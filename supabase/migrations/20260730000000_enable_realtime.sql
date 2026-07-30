-- Enable Supabase Realtime for messages and conversations tables
-- This is required for the inbox to receive instant updates without page refresh

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
