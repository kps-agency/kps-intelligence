-- Phase 19 : retrait d'un collaborateur d'une mission, tracé comme son
-- ajout (MISSION_ASSIGNED).
alter type event_type add value 'MISSION_MEMBER_REMOVED';
