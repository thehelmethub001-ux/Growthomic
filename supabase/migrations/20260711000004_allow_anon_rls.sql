-- Enable anon access to all tables so the dashboard works without a login system
CREATE POLICY "anon_users_can_read_business_settings" ON business_settings FOR SELECT TO anon USING (TRUE);
CREATE POLICY "anon_users_can_update_business_settings" ON business_settings FOR UPDATE TO anon USING (TRUE);

CREATE POLICY "anon_users_can_all_products" ON products FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "anon_users_can_all_product_videos" ON product_videos FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "anon_users_can_all_customers" ON customers FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "anon_users_can_all_conversations" ON conversations FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "anon_users_can_all_messages" ON messages FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "anon_users_can_all_orders" ON orders FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "anon_users_can_all_human_queue" ON human_queue FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "anon_users_can_all_spam_entries" ON spam_entries FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "anon_users_can_all_follow_up_jobs" ON follow_up_jobs FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
