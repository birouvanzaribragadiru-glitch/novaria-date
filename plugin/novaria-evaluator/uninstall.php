<?php
// La ștergerea plugin-ului: scoatem setările și datele de piață din cache.
// Lead-urile (cererile clienților) NU se șterg automat; le poți șterge din „Lead-uri evaluare” înainte, dacă vrei.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
delete_option( 'novaria_ev_opts' );
delete_option( 'novaria_ev_data_lastgood' );
delete_option( 'novaria_ev_fetch' );
delete_option( 'novaria_ev_api_key' );
delete_transient( 'novaria_ev_data' );
wp_clear_scheduled_hook( 'novaria_ev_daily' );
