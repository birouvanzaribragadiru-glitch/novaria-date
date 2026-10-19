<?php
// La ștergerea plugin-ului: scoatem setările și datele de piață din cache.
// Lead-urile (cererile clienților) NU se șterg automat; le poți șterge din „Lead-uri evaluare” înainte, dacă vrei.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
delete_option( 'nv_eval_opts' );
delete_option( 'nv_eval_data_lastgood' );
delete_option( 'nv_eval_fetch' );
delete_transient( 'nv_eval_data' );
wp_clear_scheduled_hook( 'nv_eval_daily' );
