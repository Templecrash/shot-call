ALTER TABLE `positions` ADD `execution_state` text;
--> statement-breakpoint
CREATE TRIGGER `reject_retired_prediction_bets` BEFORE INSERT ON `prediction_bets`
BEGIN
 SELECT RAISE(ABORT, 'Sentiment betting has been removed');
END;
