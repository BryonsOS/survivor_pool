-- survivor_validate_invite was callable without an account, so anyone could probe
-- /rest/v1/rpc/survivor_validate_invite and guess invite codes for free. The signup
-- trigger already rejects a bad code, so the pre-check bought nothing.
--
-- Only the wrestling league's own signup form still needs its equivalent, so this
-- change is scoped to the survivor function.
revoke execute on function public.survivor_validate_invite(text) from anon;

-- survivor_join() still calls it internally; a definer function is unaffected by
-- the caller's grants, so joining with a code keeps working for signed-in members.
