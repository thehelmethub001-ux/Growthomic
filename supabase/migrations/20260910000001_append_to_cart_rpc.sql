CREATE OR REPLACE FUNCTION append_to_cart(p_conversation_id UUID, p_item JSONB)
RETURNS JSONB AS $$
DECLARE
  updated_cart JSONB;
BEGIN
  UPDATE conversations
  SET cart_state = COALESCE(cart_state, '[]'::jsonb) || jsonb_build_array(p_item)
  WHERE id = p_conversation_id
  RETURNING cart_state INTO updated_cart;

  RETURN updated_cart;
END;
$$ LANGUAGE plpgsql;
