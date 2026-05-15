-- Add credit_limit to accounts (only relevant for credit_card type)
alter table accounts add column credit_limit numeric(14, 2);
