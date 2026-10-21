<?php
/**
 * Plugin Name:       Novaria Evaluator
 * Plugin URI:        https://novaria.ro/evaluare-gratuita/
 * Description:       Evaluator online pentru apartamente, case și terenuri din București și Ilfov. Datele de piață se actualizează automat (anunțuri monitorizate de Novaria + indici de piață). Pune [novaria_evaluator] pe orice pagină. Cererile de raport detaliat se salvează la „Lead-uri evaluare” și vin pe email.
 * Version:           1.5.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Novaria
 * Text Domain:       novaria-evaluator
 * License:           GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'NOVARIA_EV_VER', '1.5.0' );
require_once __DIR__ . '/includes/raport.php';
require_once __DIR__ . '/includes/urmarire.php';
define( 'NOVARIA_EV_KEY_OPT', 'novaria_ev_api_key' );   // cheia cu care aplicația internă Novaria citește evaluările de pe site
define( 'NOVARIA_EV_FILE', __FILE__ );
define( 'NOVARIA_EV_DIR', plugin_dir_path( __FILE__ ) );
define( 'NOVARIA_EV_URL', plugin_dir_url( __FILE__ ) );
define( 'NOVARIA_EV_OPT', 'novaria_ev_opts' );
define( 'NOVARIA_EV_DATA_TRANSIENT', 'novaria_ev_data' );
define( 'NOVARIA_EV_DATA_LASTGOOD', 'novaria_ev_data_lastgood' );
define( 'NOVARIA_EV_CONSENT_VER', '2026-10' );

/* ------------------------------------------------------------------ */
/* Setări                                                              */
/* ------------------------------------------------------------------ */

function novaria_ev_defaults() {
	return array(
		'email'         => get_option( 'admin_email' ),
		'phone'         => '0728 713 079',
		'whatsapp'      => '40728713079',
		'data_url'      => 'https://raw.githubusercontent.com/birouvanzaribragadiru-glitch/novaria-date/main/data/evaluator.json',
		'cache_hours'   => 6,
		'privacy_url'   => home_url( '/politica-de-confidentialitate/' ),
		'retention_m'   => 24,
		'color_main'    => '#13233F',
		'color_accent'  => '#A07B2C',
		'email_client'  => 1,
		'urmarire'      => 1,
		'raport_zone'   => 'bragadiru,domnesti,drumul-taberei,rahova,militari,popesti-leordeni',
		'raport_auto'   => 0,
		'raport_cta_url' => home_url( '/evaluare-gratuita/' ),
	);
}

function novaria_ev_opts() {
	$o = get_option( NOVARIA_EV_OPT, array() );
	return wp_parse_args( is_array( $o ) ? $o : array(), novaria_ev_defaults() );
}

function novaria_ev_hex( $c, $fallback ) {
	$c = sanitize_hex_color( $c );
	return $c ? $c : $fallback;
}

/* ------------------------------------------------------------------ */
/* Date de piață: GitHub → cache → ultima copie bună → fișierul inclus */
/* ------------------------------------------------------------------ */

function novaria_ev_valid_data( $d ) {
	return is_array( $d ) && isset( $d['v'], $d['zone'] ) && 1 === (int) $d['v'] && is_array( $d['zone'] ) && count( $d['zone'] ) > 20;
}

function novaria_ev_bundled_data() {
	$f = NOVARIA_EV_DIR . 'data/evaluator.json';
	if ( ! is_readable( $f ) ) {
		return null;
	}
	$d = json_decode( (string) file_get_contents( $f ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	return novaria_ev_valid_data( $d ) ? $d : null;
}

/**
 * Întoarce datele curente. $force = true ignoră cache-ul (butonul din setări).
 * Nu aruncă niciodată eroare către vizitator: dacă GitHub nu răspunde, folosește ultima copie bună.
 */
function novaria_ev_get_data( $force = false ) {
	if ( ! $force ) {
		$c = get_transient( NOVARIA_EV_DATA_TRANSIENT );
		if ( novaria_ev_valid_data( $c ) ) {
			return $c;
		}
	}
	$o   = novaria_ev_opts();
	$url = esc_url_raw( $o['data_url'] );
	$d   = null;
	$err = '';
	if ( $url ) {
		$r = wp_remote_get(
			add_query_arg( 't', floor( time() / 600 ), $url ),
			array(
				'timeout'    => 8,
				'user-agent' => 'NovariaEvaluator/' . NOVARIA_EV_VER . '; ' . home_url(),
			)
		);
		if ( is_wp_error( $r ) ) {
			$err = $r->get_error_message();
		} elseif ( 200 !== (int) wp_remote_retrieve_response_code( $r ) ) {
			$err = 'HTTP ' . wp_remote_retrieve_response_code( $r );
		} else {
			$j = json_decode( wp_remote_retrieve_body( $r ), true );
			if ( novaria_ev_valid_data( $j ) ) {
				$d = $j;
			} else {
				$err = 'fișier invalid';
			}
		}
	}
	$hours = max( 1, min( 48, (int) $o['cache_hours'] ) );
	if ( $d ) {
		set_transient( NOVARIA_EV_DATA_TRANSIENT, $d, $hours * HOUR_IN_SECONDS );
		update_option( NOVARIA_EV_DATA_LASTGOOD, $d, false );
		update_option( 'novaria_ev_fetch', array( 'ok' => 1, 't' => time(), 'msg' => '' ), false );
		return $d;
	}
	update_option( 'novaria_ev_fetch', array( 'ok' => 0, 't' => time(), 'msg' => $err ), false );
	$last = get_option( NOVARIA_EV_DATA_LASTGOOD );
	if ( ! novaria_ev_valid_data( $last ) ) {
		$last = novaria_ev_bundled_data();
	}
	if ( $last ) {
		// reîncearcă peste o oră, nu la fiecare vizitator
		set_transient( NOVARIA_EV_DATA_TRANSIENT, $last, HOUR_IN_SECONDS );
	}
	return $last;
}

/* ------------------------------------------------------------------ */
/* Shortcode + resurse                                                 */
/* ------------------------------------------------------------------ */

add_action( 'wp_enqueue_scripts', 'novaria_ev_register_assets' );
function novaria_ev_register_assets() {
	$v = NOVARIA_EV_VER;
	wp_register_style( 'novaria-ev', NOVARIA_EV_URL . 'assets/widget.css', array(), $v );
	wp_register_script( 'novaria-ev-engine', NOVARIA_EV_URL . 'assets/engine.js', array(), $v, true );
	wp_register_script( 'novaria-ev-zcombo', NOVARIA_EV_URL . 'assets/zcombo.js', array(), $v, true );
	wp_register_script( 'novaria-ev', NOVARIA_EV_URL . 'assets/widget.js', array( 'novaria-ev-engine', 'novaria-ev-zcombo' ), $v, true );
}

add_shortcode( 'novaria_evaluator', 'novaria_ev_shortcode' );
function novaria_ev_shortcode( $atts ) {
	$o = novaria_ev_opts();
	// temele bloc (FSE) randează conținutul înainte de wp_enqueue_scripts: ne asigurăm că resursele sunt înregistrate
	if ( ! wp_script_is( 'novaria-ev', 'registered' ) ) {
		novaria_ev_register_assets();
	}
	wp_enqueue_style( 'novaria-ev' );
	wp_enqueue_script( 'novaria-ev' );
	$cfg = array(
		'dataUrl'    => esc_url_raw( rest_url( 'novaria-evaluator/v1/date' ) ),
		'leadUrl'    => esc_url_raw( rest_url( 'novaria-evaluator/v1/lead' ) ),
		'evalUrl'    => esc_url_raw( rest_url( 'novaria-evaluator/v1/evaluare' ) ),
		'ajaxUrl'    => esc_url_raw( admin_url( 'admin-ajax.php' ) ),
		'bundledUrl' => esc_url_raw( NOVARIA_EV_URL . 'data/evaluator.json?v=' . NOVARIA_EV_VER ),
		'streetsUrl' => esc_url_raw( NOVARIA_EV_URL . 'data/strazi.json?v=' . NOVARIA_EV_VER ),
		'phone'      => (string) $o['phone'],
		'whatsapp'   => preg_replace( '/\D+/', '', (string) $o['whatsapp'] ),
		'privacyUrl' => esc_url_raw( $o['privacy_url'] ),
		'consentVer' => NOVARIA_EV_CONSENT_VER,
	);
	// configurația stă pe element (nu într-un script separat), ca să meargă și cu plugin-uri de cache/optimizare JS
	$main   = novaria_ev_hex( $o['color_main'], '#13233F' );
	$accent = novaria_ev_hex( $o['color_accent'], '#A07B2C' );
	$style  = '--nvev-main:' . $main . ';--nvev-accent:' . $accent . ';';
	ob_start();
	?>
	<div class="nvev" id="novaria-ev" style="<?php echo esc_attr( $style ); ?>" data-cfg="<?php echo esc_attr( wp_json_encode( $cfg ) ); ?>">
		<div class="nvev-loading" role="status"><span class="nvev-spin" aria-hidden="true"></span> Se încarcă evaluatorul…</div>
		<noscript><p>Evaluatorul are nevoie de JavaScript. Ne poți suna la <a href="tel:<?php echo esc_attr( preg_replace( '/\s+/', '', $o['phone'] ) ); ?>"><?php echo esc_html( $o['phone'] ); ?></a> pentru o evaluare gratuită.</p></noscript>
	</div>
	<?php
	return ob_get_clean();
}

/* ------------------------------------------------------------------ */
/* Lead-uri: tip de conținut privat                                    */
/* ------------------------------------------------------------------ */

add_action( 'init', 'novaria_ev_register_cpt' );
function novaria_ev_register_cpt() {
	register_post_type(
		'novaria_lead',
		array(
			'labels'              => array(
				'name'               => 'Lead-uri evaluare',
				'singular_name'      => 'Lead evaluare',
				'menu_name'          => 'Lead-uri evaluare',
				'all_items'          => 'Toate lead-urile',
				'edit_item'          => 'Lead evaluare',
				'search_items'       => 'Caută lead-uri',
				'not_found'          => 'Niciun lead încă.',
				'not_found_in_trash' => 'Niciun lead în coș.',
			),
			'public'              => false,
			'publicly_queryable'  => false,
			'exclude_from_search' => true,
			'show_ui'             => true,
			'show_in_menu'        => true,
			'show_in_rest'        => false,
			'menu_icon'           => 'dashicons-chart-area',
			'menu_position'       => 26,
			'supports'            => array( 'title' ),
			// conțin date personale: doar administratorii le văd
			'capability_type'     => 'post',
			'capabilities'        => array(
				'create_posts'           => 'do_not_allow',
				'edit_posts'             => 'manage_options',
				'edit_others_posts'      => 'manage_options',
				'edit_private_posts'     => 'manage_options',
				'edit_published_posts'   => 'manage_options',
				'publish_posts'          => 'manage_options',
				'read_private_posts'     => 'manage_options',
				'delete_posts'           => 'manage_options',
				'delete_others_posts'    => 'manage_options',
				'delete_private_posts'   => 'manage_options',
				'delete_published_posts' => 'manage_options',
			),
			'map_meta_cap'        => true,
			'rewrite'             => false,
			'query_var'           => false,
		)
	);
	// evaluările făcute de vizitatori fără să lase contact: doar proprietatea și estimarea, fără date personale
	register_post_type(
		'novaria_eval',
		array(
			'labels'              => array(
				'name'          => 'Evaluări pe site',
				'singular_name' => 'Evaluare pe site',
				'menu_name'     => 'Evaluări pe site',
				'all_items'     => 'Toate evaluările',
				'not_found'     => 'Nicio evaluare încă.',
			),
			'public'              => false,
			'publicly_queryable'  => false,
			'exclude_from_search' => true,
			'show_ui'             => true,
			'show_in_menu'        => 'edit.php?post_type=novaria_lead',
			'show_in_rest'        => false,
			'supports'            => array( 'title' ),
			'capability_type'     => 'post',
			'capabilities'        => array(
				'create_posts'           => 'do_not_allow',
				'edit_posts'             => 'manage_options',
				'edit_others_posts'      => 'manage_options',
				'edit_private_posts'     => 'manage_options',
				'edit_published_posts'   => 'manage_options',
				'publish_posts'          => 'manage_options',
				'read_private_posts'     => 'manage_options',
				'delete_posts'           => 'manage_options',
				'delete_others_posts'    => 'manage_options',
				'delete_private_posts'   => 'manage_options',
				'delete_published_posts' => 'manage_options',
			),
			'map_meta_cap'        => true,
			'rewrite'             => false,
			'query_var'           => false,
		)
	);
}

/** Cheia pentru aplicația internă (se generează o dată; se vede în Setări). */
function novaria_ev_api_key() {
	$k = get_option( NOVARIA_EV_KEY_OPT, '' );
	if ( ! is_string( $k ) || strlen( $k ) < 24 ) {
		$k = wp_generate_password( 40, false, false );
		update_option( NOVARIA_EV_KEY_OPT, $k, false );
	}
	return $k;
}

/* ------------------------------------------------------------------ */
/* REST API (+ variantă admin-ajax dacă REST e blocat de un plugin)     */
/* ------------------------------------------------------------------ */

add_action( 'rest_api_init', 'novaria_ev_rest' );
function novaria_ev_rest() {
	register_rest_route(
		'novaria-evaluator/v1',
		'/date',
		array(
			'methods'             => 'GET',
			'callback'            => 'novaria_ev_rest_data',
			'permission_callback' => '__return_true',
		)
	);
	register_rest_route(
		'novaria-evaluator/v1',
		'/lead',
		array(
			'methods'             => 'POST',
			'callback'            => 'novaria_ev_rest_lead',
			'permission_callback' => '__return_true',
		)
	);
	// evaluare anonimă (fără contact), trimisă de widget când vizitatorul vede un rezultat
	register_rest_route(
		'novaria-evaluator/v1',
		'/evaluare',
		array(
			'methods'             => 'POST',
			'callback'            => 'novaria_ev_rest_eval',
			'permission_callback' => '__return_true',
		)
	);
	// citirea evaluărilor și cererilor de pe site de către aplicația internă Novaria (cu cheie)
	register_rest_route(
		'novaria-evaluator/v1',
		'/evaluari',
		array(
			'methods'             => 'GET',
			'callback'            => 'novaria_ev_rest_list',
			'permission_callback' => '__return_true',
			'args'                => array(
				'key'   => array( 'type' => 'string', 'required' => true ),
				'limit' => array( 'type' => 'integer', 'default' => 200 ),
				'since' => array( 'type' => 'string', 'default' => '' ),
			),
		)
	);
}

function novaria_ev_rest_eval( WP_REST_Request $req ) {
	$p = $req->get_json_params();
	if ( ! is_array( $p ) ) {
		$p = $req->get_body_params();
	}
	$res = novaria_ev_handle_eval( is_array( $p ) ? $p : array() );
	return new WP_REST_Response( $res['body'], $res['code'] );
}

/** Evaluare anonimă: o înregistrare pe sesiune de vizitator (sid) și zi, actualizată când vizitatorul schimbă câmpurile. */
function novaria_ev_handle_eval( $p ) {
	$fail = function ( $msg, $code = 400 ) {
		return array( 'code' => $code, 'body' => array( 'ok' => false, 'msg' => $msg ) );
	};
	if ( ! empty( $p['website'] ) ) {
		return array( 'code' => 200, 'body' => array( 'ok' => true ) );
	}
	$sid = isset( $p['sid'] ) ? preg_replace( '/[^a-zA-Z0-9_-]/', '', substr( (string) $p['sid'], 0, 40 ) ) : '';
	if ( strlen( $sid ) < 8 ) {
		return $fail( 'sid' );
	}
	$k  = 'novaria_ev_rle_' . novaria_ev_client_key();
	$n  = (int) get_transient( $k );
	if ( $n >= 60 ) {
		return $fail( 'prea multe', 429 );
	}
	$s_in = isset( $p['proprietate'] ) && is_array( $p['proprietate'] ) ? $p['proprietate'] : array();
	$s    = array();
	foreach ( novaria_ev_subject_keys() as $key ) {
		if ( ! isset( $s_in[ $key ] ) || '' === $s_in[ $key ] || null === $s_in[ $key ] ) {
			continue;
		}
		$v = $s_in[ $key ];
		if ( is_bool( $v ) ) {
			$s[ $key ] = $v;
		} elseif ( is_numeric( $v ) ) {
			$s[ $key ] = 0 + $v;
		} else {
			$s[ $key ] = sanitize_text_field( mb_substr( (string) $v, 0, ( 'strada' === $key || 'ansamblu' === $key ) ? 80 : 40 ) );
		}
	}
	$tip  = isset( $s['tip'] ) && in_array( $s['tip'], array( 'apartament', 'casa', 'teren' ), true ) ? $s['tip'] : '';
	$mp   = isset( $s['mp'] ) ? novaria_ev_clean_num( $s['mp'], 5, 100000 ) : null;
	if ( ! $tip || ! $mp || empty( $s['zona'] ) ) {
		return $fail( 'incomplet' );
	}
	$zona = isset( $p['zonaNume'] ) ? sanitize_text_field( substr( (string) $p['zonaNume'], 0, 80 ) ) : '';
	$e_in = isset( $p['estimare'] ) && is_array( $p['estimare'] ) ? $p['estimare'] : array();
	$est  = array();
	foreach ( array( 'min', 'max', 'realist', 'rapid', 'listare', 'ppm' ) as $key ) {
		if ( isset( $e_in[ $key ] ) ) {
			$v = novaria_ev_clean_num( $e_in[ $key ], 0, 50000000 );
			if ( null !== $v ) {
				$est[ $key ] = round( $v );
			}
		}
	}
	$pagina  = isset( $p['pagina'] ) ? esc_url_raw( substr( (string) $p['pagina'], 0, 300 ) ) : '';
	$tip_lbl = array( 'apartament' => 'Apartament', 'casa' => 'Casă', 'teren' => 'Teren' );
	$title   = trim( $tip_lbl[ $tip ] . ' ' . round( $mp ) . ' mp' . ( ! empty( $s['strada'] ) ? ', ' . $s['strada'] : '' ) . ( $zona ? ', ' . $zona : '' ) . ( isset( $est['realist'] ) ? ' — ' . novaria_ev_fmt_eur( $est['realist'] ) : '' ) );
	// aceeași sesiune în aceeași zi: actualizăm înregistrarea, nu facem alta
	$ex = get_posts(
		array(
			'post_type'      => 'novaria_eval',
			'post_status'    => 'any',
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'meta_key'       => '_novaria_sid', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'     => $sid, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			'date_query'     => array( array( 'after' => gmdate( 'Y-m-d H:i:s', time() - DAY_IN_SECONDS ) ) ),
		)
	);
	if ( $ex ) {
		$post_id = (int) $ex[0];
		wp_update_post( array( 'ID' => $post_id, 'post_title' => $title ) );
	} else {
		$post_id = wp_insert_post( array( 'post_type' => 'novaria_eval', 'post_status' => 'private', 'post_title' => $title ), true );
		if ( is_wp_error( $post_id ) ) {
			return $fail( 'salvare', 500 );
		}
		update_post_meta( $post_id, '_novaria_sid', $sid );
		set_transient( $k, $n + 1, HOUR_IN_SECONDS );
	}
	update_post_meta( $post_id, '_novaria_zona', $zona );
	update_post_meta( $post_id, '_novaria_tip', $tip );
	update_post_meta( $post_id, '_novaria_prop', $s );
	update_post_meta( $post_id, '_novaria_est', $est );
	update_post_meta( $post_id, '_novaria_pagina', $pagina );
	update_post_meta( $post_id, '_novaria_actualizat', current_time( 'mysql', true ) );
	return array( 'code' => 200, 'body' => array( 'ok' => true, 'id' => $post_id ) );
}

/** Lista pentru aplicația internă: cererile cu contact (lead-uri) și evaluările anonime, cele mai noi primele. */
function novaria_ev_rest_list( WP_REST_Request $req ) {
	$key = (string) $req->get_param( 'key' );
	if ( ! $key || ! hash_equals( novaria_ev_api_key(), $key ) ) {
		$r = new WP_REST_Response( array( 'ok' => false, 'msg' => 'cheie greșită' ), 403 );
		$r->header( 'Cache-Control', 'no-store' );
		return $r;
	}
	$limit = max( 1, min( 500, (int) $req->get_param( 'limit' ) ) );
	$since = (string) $req->get_param( 'since' );
	$args  = array( 'post_status' => 'any', 'posts_per_page' => $limit, 'orderby' => 'date', 'order' => 'DESC' );
	if ( $since && strtotime( $since ) ) {
		$args['date_query'] = array( array( 'after' => gmdate( 'Y-m-d H:i:s', strtotime( $since ) ), 'column' => 'post_date_gmt' ) );
	}
	$out   = array();
	$sids  = array();
	foreach ( get_posts( array_merge( $args, array( 'post_type' => 'novaria_lead' ) ) ) as $post ) {
		$id   = $post->ID;
		$sid  = (string) get_post_meta( $id, '_novaria_sid', true );
		if ( $sid ) {
			$sids[ $sid ] = 1;
		}
		$out[] = array(
			'id'       => 'lead-' . $id,
			'fel'      => 'lead',
			't'        => mysql2date( 'c', $post->post_date_gmt, false ),
			'tip'      => (string) get_post_meta( $id, '_novaria_tip', true ),
			'zonaNume' => (string) get_post_meta( $id, '_novaria_zona', true ),
			'prop'     => (object) (array) get_post_meta( $id, '_novaria_prop', true ),
			'est'      => (object) (array) get_post_meta( $id, '_novaria_est', true ),
			'contact'  => array(
				'nume'     => (string) get_post_meta( $id, '_novaria_nume', true ),
				'telefon'  => (string) get_post_meta( $id, '_novaria_telefon', true ),
				'email'    => (string) get_post_meta( $id, '_novaria_email', true ),
				'timeline' => (string) get_post_meta( $id, '_novaria_timeline', true ),
				'mesaj'    => (string) get_post_meta( $id, '_novaria_mesaj', true ),
			),
			'pagina'   => (string) get_post_meta( $id, '_novaria_pagina', true ),
			'admin'    => admin_url( 'post.php?post=' . $id . '&action=edit' ),
		);
	}
	foreach ( get_posts( array_merge( $args, array( 'post_type' => 'novaria_eval' ) ) ) as $post ) {
		$id  = $post->ID;
		$sid = (string) get_post_meta( $id, '_novaria_sid', true );
		if ( $sid && isset( $sids[ $sid ] ) ) {
			continue; // vizitatorul a lăsat și contact: apare o singură dată, ca lead
		}
		$out[] = array(
			'id'       => 'eval-' . $id,
			'fel'      => 'evaluare',
			't'        => mysql2date( 'c', $post->post_date_gmt, false ),
			'tip'      => (string) get_post_meta( $id, '_novaria_tip', true ),
			'zonaNume' => (string) get_post_meta( $id, '_novaria_zona', true ),
			'prop'     => (object) (array) get_post_meta( $id, '_novaria_prop', true ),
			'est'      => (object) (array) get_post_meta( $id, '_novaria_est', true ),
			'contact'  => null,
			'pagina'   => (string) get_post_meta( $id, '_novaria_pagina', true ),
		);
	}
	usort( $out, function ( $a, $b ) { return strcmp( $b['t'], $a['t'] ); } );
	$out = array_slice( $out, 0, $limit );
	$r   = new WP_REST_Response( array( 'ok' => true, 'n' => count( $out ), 'generat' => gmdate( 'c' ), 'items' => $out ), 200 );
	$r->header( 'Cache-Control', 'no-store' );
	return $r;
}

function novaria_ev_rest_data() {
	$d = novaria_ev_get_data();
	if ( ! $d ) {
		return new WP_REST_Response( array( 'error' => 'indisponibil' ), 503 );
	}
	if ( isset( $d['params'] ) && empty( $d['params'] ) ) {
		$d['params'] = new stdClass(); // rămâne obiect în JSON
	}
	$r = new WP_REST_Response( $d, 200 );
	$r->header( 'Cache-Control', 'public, max-age=1800' );
	return $r;
}

function novaria_ev_rest_lead( WP_REST_Request $req ) {
	$p = $req->get_json_params();
	if ( ! is_array( $p ) ) {
		$p = $req->get_body_params();
	}
	$res = novaria_ev_handle_lead( is_array( $p ) ? $p : array() );
	return new WP_REST_Response( $res['body'], $res['code'] );
}

add_action( 'wp_ajax_nopriv_novaria_ev_lead', 'novaria_ev_ajax_lead' );
add_action( 'wp_ajax_novaria_ev_lead', 'novaria_ev_ajax_lead' );
function novaria_ev_ajax_lead() {
	$raw = isset( $_POST['payload'] ) ? wp_unslash( $_POST['payload'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- formular public, protejat cu honeypot + limită; câmpurile se curăță individual mai jos.
	$p   = json_decode( (string) $raw, true );
	$res = novaria_ev_handle_lead( is_array( $p ) ? $p : array() );
	wp_send_json( $res['body'], $res['code'] );
}

add_action( 'wp_ajax_nopriv_novaria_ev_data', 'novaria_ev_ajax_data' );
add_action( 'wp_ajax_novaria_ev_data', 'novaria_ev_ajax_data' );
function novaria_ev_ajax_data() {
	$d = novaria_ev_get_data();
	wp_send_json( $d ? $d : array( 'error' => 'indisponibil' ), $d ? 200 : 503 );
}

function novaria_ev_client_key() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	return substr( hash_hmac( 'sha256', $ip, wp_salt( 'nonce' ) ), 0, 20 );
}

function novaria_ev_clean_num( $v, $min, $max ) {
	if ( ! is_numeric( $v ) ) {
		return null;
	}
	$v = (float) $v;
	return ( $v >= $min && $v <= $max ) ? $v : null;
}

/** Câmpurile proprietății acceptate (restul se ignoră). */
function novaria_ev_subject_keys() {
	return array( 'tip', 'zona', 'strada', 'ansamblu', 'microPct', 'mp', 'mpBalcon', 'camere', 'an', 'etaj', 'etajeTotal', 'lift', 'stare', 'compart', 'incalzire', 'balcon', 'parcareNr', 'parcareTip', 'metrou', 'seismic', 'anvelopat', 'juridic', 'teren', 'tipCasa', 'structura', 'regim', 'front', 'utilCanal', 'utilGaz', 'asfalt', 'garaj', 'intravilan', 'utilApa', 'utilCanalT', 'utilGazT', 'utilCurent', 'acces', 'destinatie', 'bai', 'acoperis', 'material', 'orientare', 'cert', 'vedere', 'stadiu', 'mobilat', 'boxa', 'forma' );
}

function novaria_ev_handle_lead( $p ) {
	$fail = function ( $msg, $code = 400 ) {
		return array( 'code' => $code, 'body' => array( 'ok' => false, 'msg' => $msg ) );
	};
	// capcane pentru roboți: câmp ascuns completat sau formular trimis prea repede
	if ( ! empty( $p['website'] ) ) {
		return array( 'code' => 200, 'body' => array( 'ok' => true ) );
	}
	$elapsed = isset( $p['t'] ) ? (int) $p['t'] : 0;
	if ( $elapsed > 0 && $elapsed < 2500 ) {
		return $fail( 'Te rugăm să mai încerci o dată.' );
	}
	// limită: 6 trimiteri pe oră de la aceeași adresă, 80 pe oră în total
	$k  = 'novaria_ev_rl_' . novaria_ev_client_key();
	$n  = (int) get_transient( $k );
	$gk = 'novaria_ev_rl_all';
	$gn = (int) get_transient( $gk );
	if ( $n >= 6 || $gn >= 80 ) {
		return $fail( 'Ai trimis deja câteva cereri. Te rugăm să ne suni sau să ne scrii pe WhatsApp.', 429 );
	}

	$tel_raw = isset( $p['telefon'] ) ? (string) $p['telefon'] : '';
	$digits  = preg_replace( '/\D+/', '', $tel_raw );
	if ( 0 === strpos( $digits, '0040' ) ) {
		$digits = substr( $digits, 2 );
	}
	if ( strlen( $digits ) < 9 || strlen( $digits ) > 13 ) {
		return $fail( 'Numărul de telefon nu pare corect.' );
	}
	if ( empty( $p['acord'] ) ) {
		return $fail( 'Avem nevoie de acordul tău ca să te putem contacta.' );
	}
	$tel   = sanitize_text_field( substr( $tel_raw, 0, 30 ) );
	$nume  = isset( $p['nume'] ) ? sanitize_text_field( substr( (string) $p['nume'], 0, 80 ) ) : '';
	$email = isset( $p['email'] ) ? sanitize_email( substr( (string) $p['email'], 0, 120 ) ) : '';
	if ( $email && ! is_email( $email ) ) {
		$email = '';
	}
	$mesaj = isset( $p['mesaj'] ) ? sanitize_textarea_field( substr( (string) $p['mesaj'], 0, 600 ) ) : '';
	$tl_ok = array( 'acum' => 'cât mai repede', '1-3' => 'în 1–3 luni', '3-6' => 'în 3–6 luni', '6+' => 'peste 6 luni', 'info' => 'doar se informează' );
	$timeline = isset( $p['timeline'] ) && isset( $tl_ok[ (string) $p['timeline'] ] ) ? $tl_ok[ (string) $p['timeline'] ] : '';
	$pagina = isset( $p['pagina'] ) ? esc_url_raw( substr( (string) $p['pagina'], 0, 300 ) ) : '';

	$s_in = isset( $p['proprietate'] ) && is_array( $p['proprietate'] ) ? $p['proprietate'] : array();
	$s    = array();
	foreach ( novaria_ev_subject_keys() as $key ) {
		if ( ! isset( $s_in[ $key ] ) || '' === $s_in[ $key ] || null === $s_in[ $key ] ) {
			continue;
		}
		$v = $s_in[ $key ];
		if ( is_bool( $v ) ) {
			$s[ $key ] = $v;
		} elseif ( is_numeric( $v ) ) {
			$s[ $key ] = 0 + $v;
		} else {
			$s[ $key ] = sanitize_text_field( mb_substr( (string) $v, 0, ( 'strada' === $key || 'ansamblu' === $key ) ? 80 : 40 ) );
		}
	}
	$tip  = isset( $s['tip'] ) && in_array( $s['tip'], array( 'apartament', 'casa', 'teren' ), true ) ? $s['tip'] : '';
	$zona = isset( $p['zonaNume'] ) ? sanitize_text_field( substr( (string) $p['zonaNume'], 0, 80 ) ) : '';
	$mp   = isset( $s['mp'] ) ? novaria_ev_clean_num( $s['mp'], 5, 100000 ) : null;

	$e_in = isset( $p['estimare'] ) && is_array( $p['estimare'] ) ? $p['estimare'] : array();
	$est  = array();
	foreach ( array( 'min', 'max', 'realist', 'rapid', 'listare', 'ppm' ) as $key ) {
		if ( isset( $e_in[ $key ] ) ) {
			$v = novaria_ev_clean_num( $e_in[ $key ], 0, 50000000 );
			if ( null !== $v ) {
				$est[ $key ] = round( $v );
			}
		}
	}

	$tip_lbl = array( 'apartament' => 'Apartament', 'casa' => 'Casă', 'teren' => 'Teren' );
	$title   = trim( ( $tip ? $tip_lbl[ $tip ] : 'Proprietate' ) . ( $mp ? ' ' . round( $mp ) . ' mp' : '' ) . ( ! empty( $s['strada'] ) ? ', ' . $s['strada'] : '' ) . ( $zona ? ', ' . $zona : '' ) . ' — ' . $tel );
	$post_id = wp_insert_post(
		array(
			'post_type'   => 'novaria_lead',
			'post_status' => 'private',
			'post_title'  => $title,
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return $fail( 'Nu am putut salva cererea. Te rugăm să ne suni.', 500 );
	}
	update_post_meta( $post_id, '_novaria_telefon', $tel );
	update_post_meta( $post_id, '_novaria_nume', $nume );
	update_post_meta( $post_id, '_novaria_email', $email );
	update_post_meta( $post_id, '_novaria_mesaj', $mesaj );
	update_post_meta( $post_id, '_novaria_timeline', $timeline );
	update_post_meta( $post_id, '_novaria_zona', $zona );
	update_post_meta( $post_id, '_novaria_tip', $tip );
	update_post_meta( $post_id, '_novaria_prop', $s );
	update_post_meta( $post_id, '_novaria_est', $est );
	update_post_meta( $post_id, '_novaria_pagina', $pagina );
	update_post_meta( $post_id, '_novaria_acord', array( 'v' => NOVARIA_EV_CONSENT_VER, 't' => current_time( 'mysql' ) ) );
	update_post_meta( $post_id, '_novaria_data_ver', isset( $p['dateVer'] ) ? sanitize_text_field( substr( (string) $p['dateVer'], 0, 40 ) ) : '' );
	if ( ! empty( $p['sid'] ) ) {
		update_post_meta( $post_id, '_novaria_sid', preg_replace( '/[^a-zA-Z0-9_-]/', '', substr( (string) $p['sid'], 0, 40 ) ) );
	}

	set_transient( $k, $n + 1, HOUR_IN_SECONDS );
	set_transient( $gk, $gn + 1, HOUR_IN_SECONDS );

	novaria_ev_mail_lead( $post_id );
	novaria_ev_mail_client( $post_id );
	novaria_ev_urmarire_programeaza( $post_id );
	return array( 'code' => 200, 'body' => array( 'ok' => true ) );
}

function novaria_ev_fmt_eur( $v ) {
	return number_format( (float) $v, 0, ',', '.' ) . ' €';
}

function novaria_ev_lead_lines( $post_id ) {
	$s   = (array) get_post_meta( $post_id, '_novaria_prop', true );
	$est = (array) get_post_meta( $post_id, '_novaria_est', true );
	$L   = array();
	$L[] = 'Telefon: ' . get_post_meta( $post_id, '_novaria_telefon', true );
	$nm  = get_post_meta( $post_id, '_novaria_nume', true );
	$em  = get_post_meta( $post_id, '_novaria_email', true );
	if ( $nm ) {
		$L[] = 'Nume: ' . $nm;
	}
	if ( $em ) {
		$L[] = 'Email: ' . $em;
	}
	$tl = get_post_meta( $post_id, '_novaria_timeline', true );
	if ( $tl ) {
		$L[] = 'Vrea să vândă: ' . $tl;
	}
	$L[] = '';
	$L[] = 'Proprietatea: ' . get_post_field( 'post_title', $post_id );
	$labels = array(
		'strada' => 'Strada', 'ansamblu' => 'Ansamblu rezidențial', 'microPct' => 'Strada / ansamblul față de media zonei (%)', 'mpBalcon' => 'Balcon / terasă (mp)',
		'camere' => 'Camere', 'an' => 'An construcție', 'etaj' => 'Etaj', 'etajeTotal' => 'Din etaje', 'stare' => 'Stare',
		'parcareNr' => 'Locuri parcare', 'parcareTip' => 'Tip parcare', 'teren' => 'Teren (mp)', 'tipCasa' => 'Tip casă',
		'compart' => 'Compartimentare', 'incalzire' => 'Încălzire', 'balcon' => 'Balcon', 'metrou' => 'Metrou (min)',
		'seismic' => 'Seismic', 'juridic' => 'Juridic', 'intravilan' => 'Intravilan', 'front' => 'Front (m)', 'structura' => 'Structură', 'regim' => 'Regim',
		'bai' => 'Băi', 'lift' => 'Lift', 'acoperis' => 'Deasupra ultimului etaj', 'material' => 'Structura blocului', 'orientare' => 'Orientare', 'cert' => 'Certificat energetic', 'vedere' => 'Expunere / vedere', 'stadiu' => 'Stadiu', 'mobilat' => 'Mobilat', 'boxa' => 'Boxă',
	);
	$vals = array(
		'stare'      => array( 'gri' => 'la gri', 'rosu' => 'la roșu', 'renovare' => 'de renovat complet', 'imbunatatiri' => 'necesită îmbunătățiri', 'locuibil' => 'bună, locuibilă', 'renovat' => 'renovată / finisaje bune', 'premium' => 'premium / lux' ),
		'parcareTip' => array( 'exterior' => 'exterior', 'subteran' => 'subteran', 'garaj' => 'garaj / box' ),
		'juridic'    => array( 'ok' => 'fără probleme declarate', 'probleme' => 'are probleme juridice' ),
		'an'         => array( '1935' => 'interbelic', '1968' => '1945–1977', '1975' => 'înainte de 1990', '1984' => '1978–1990', '1998' => '1991–2005', '2010' => '2006–2014', '2018' => '2015–2020', '2023' => '2021+' ),
		'etaj'       => array( 'P' => 'parter', 'D' => 'demisol', 'M' => 'mansardă' ),
	);
	foreach ( $labels as $k => $lab ) {
		if ( isset( $s[ $k ] ) && '' !== $s[ $k ] ) {
			$v   = is_bool( $s[ $k ] ) ? ( $s[ $k ] ? 'da' : 'nu' ) : $s[ $k ];
			if ( isset( $vals[ $k ][ (string) $v ] ) ) {
				$v = $vals[ $k ][ (string) $v ];
			}
			$L[] = '  ' . $lab . ': ' . $v;
		}
	}
	if ( isset( $est['min'], $est['max'] ) ) {
		$L[] = '';
		$L[] = 'Estimare afișată: ' . novaria_ev_fmt_eur( $est['min'] ) . ' – ' . novaria_ev_fmt_eur( $est['max'] );
		if ( isset( $est['realist'] ) ) {
			$L[] = '  Preț realist: ' . novaria_ev_fmt_eur( $est['realist'] ) . ( isset( $est['ppm'] ) ? ' (' . novaria_ev_fmt_eur( $est['ppm'] ) . '/mp)' : '' );
		}
		if ( isset( $est['rapid'], $est['listare'] ) ) {
			$L[] = '  Rapid: ' . novaria_ev_fmt_eur( $est['rapid'] ) . ' · Listare: ' . novaria_ev_fmt_eur( $est['listare'] );
		}
	}
	$m = get_post_meta( $post_id, '_novaria_mesaj', true );
	if ( $m ) {
		$L[] = '';
		$L[] = 'Mesaj: ' . $m;
	}
	return $L;
}

function novaria_ev_mail_lead( $post_id ) {
	$o  = novaria_ev_opts();
	$to = is_email( $o['email'] ) ? $o['email'] : get_option( 'admin_email' );
	$L  = novaria_ev_lead_lines( $post_id );
	$L[] = '';
	$L[] = 'Vezi lead-ul: ' . admin_url( 'post.php?post=' . (int) $post_id . '&action=edit' );
	$headers = array( 'Content-Type: text/plain; charset=UTF-8' );
	$em      = get_post_meta( $post_id, '_novaria_email', true );
	if ( $em && is_email( $em ) ) {
		$headers[] = 'Reply-To: ' . $em;
	}
	$who = get_post_meta( $post_id, '_novaria_nume', true );
	$who = $who ? $who : get_post_meta( $post_id, '_novaria_telefon', true );
	$zn  = get_post_meta( $post_id, '_novaria_zona', true );
	wp_mail( $to, 'Lead evaluare: ' . $who . ( $zn ? ' — ' . $zn : '' ), implode( "\n", $L ), $headers );
}

/** Emailul către client (doar dacă și-a lăsat adresa): estimarea și pașii următori. */
function novaria_ev_mail_client( $post_id ) {
	$o  = novaria_ev_opts();
	$em = get_post_meta( $post_id, '_novaria_email', true );
	if ( empty( $o['email_client'] ) || ! $em || ! is_email( $em ) ) {
		return;
	}
	$est = (array) get_post_meta( $post_id, '_novaria_est', true );
	if ( ! isset( $est['min'], $est['max'] ) ) {
		return;
	}
	$nm  = get_post_meta( $post_id, '_novaria_nume', true );
	$zn  = get_post_meta( $post_id, '_novaria_zona', true );
	$ttl = get_post_field( 'post_title', $post_id );
	$ttl = preg_replace( '/\s+—\s+.*$/u', '', $ttl );
	$L   = array();
	$L[] = 'Bună' . ( $nm ? ', ' . $nm : '' ) . ',';
	$L[] = '';
	$L[] = 'Îți mulțumim că ai folosit evaluatorul Novaria. Iată estimarea pentru ' . $ttl . ':';
	$L[] = '';
	$L[] = 'Valoare estimată: ' . novaria_ev_fmt_eur( $est['min'] ) . ' – ' . novaria_ev_fmt_eur( $est['max'] );
	if ( isset( $est['realist'] ) ) {
		$L[] = 'Preț realist de vânzare: ' . novaria_ev_fmt_eur( $est['realist'] ) . ( isset( $est['ppm'] ) ? ' (' . novaria_ev_fmt_eur( $est['ppm'] ) . '/mp)' : '' );
	}
	if ( isset( $est['rapid'], $est['listare'] ) ) {
		$L[] = 'Vânzare rapidă: ' . novaria_ev_fmt_eur( $est['rapid'] ) . ' · Preț de listare recomandat: ' . novaria_ev_fmt_eur( $est['listare'] );
	}
	$L[] = '';
	$L[] = 'Este o estimare automată, pornind de la prețurile cerute acum' . ( $zn ? ' în ' . $zn : ' în zonă' ) . '. Un consultant Novaria te contactează pentru evaluarea completă, gratuită, pe proprietăți comparabile actuale.';
	$L[] = '';
	$L[] = 'Dacă vrei să vorbim mai repede: ' . $o['phone'] . ( $o['whatsapp'] ? ' · WhatsApp: https://wa.me/' . $o['whatsapp'] : '' );
	$L[] = '';
	$L[] = 'Echipa Novaria';
	$reply   = is_email( $o['email'] ) ? $o['email'] : get_option( 'admin_email' );
	$headers = array( 'Content-Type: text/plain; charset=UTF-8', 'Reply-To: ' . $reply );
	wp_mail( $em, 'Estimarea ta Novaria: ' . novaria_ev_fmt_eur( $est['min'] ) . ' – ' . novaria_ev_fmt_eur( $est['max'] ), implode( "\n", $L ), $headers );
}

/* ------------------------------------------------------------------ */
/* Admin: coloane, detalii, setări                                      */
/* ------------------------------------------------------------------ */

add_filter( 'manage_novaria_lead_posts_columns', 'novaria_ev_cols' );
function novaria_ev_cols( $c ) {
	return array(
		'cb'       => isset( $c['cb'] ) ? $c['cb'] : '',
		'title'    => 'Proprietate',
		'nv_tel'   => 'Telefon',
		'nv_nume'  => 'Nume',
		'nv_est'   => 'Estimare',
		'date'     => 'Data',
	);
}
add_action( 'manage_novaria_lead_posts_custom_column', 'novaria_ev_col', 10, 2 );
function novaria_ev_col( $col, $post_id ) {
	if ( 'nv_tel' === $col ) {
		$t = get_post_meta( $post_id, '_novaria_telefon', true );
		echo '<a href="tel:' . esc_attr( preg_replace( '/[^\d+]/', '', $t ) ) . '">' . esc_html( $t ) . '</a>';
	} elseif ( 'nv_nume' === $col ) {
		echo esc_html( get_post_meta( $post_id, '_novaria_nume', true ) );
	} elseif ( 'nv_est' === $col ) {
		$e = (array) get_post_meta( $post_id, '_novaria_est', true );
		if ( isset( $e['min'], $e['max'] ) ) {
			echo esc_html( novaria_ev_fmt_eur( $e['min'] ) . ' – ' . novaria_ev_fmt_eur( $e['max'] ) );
		}
	}
}

add_action( 'add_meta_boxes_novaria_lead', 'novaria_ev_metabox' );
function novaria_ev_metabox() {
	add_meta_box( 'novaria_lead_det', 'Detalii cerere', 'novaria_ev_metabox_html', 'novaria_lead', 'normal', 'high' );
}
function novaria_ev_metabox_html( $post ) {
	echo '<pre style="white-space:pre-wrap;font:14px/1.6 system-ui,sans-serif;margin:0">' . esc_html( implode( "\n", novaria_ev_lead_lines( $post->ID ) ) ) . '</pre>';
	$pg = get_post_meta( $post->ID, '_novaria_pagina', true );
	$ac = (array) get_post_meta( $post->ID, '_novaria_acord', true );
	echo '<p style="color:#646970">';
	if ( $pg ) {
		echo 'Trimis de pe: ' . esc_html( $pg ) . '<br>';
	}
	if ( ! empty( $ac['t'] ) ) {
		echo 'Acord de contactare dat la ' . esc_html( $ac['t'] ) . ' (text versiunea ' . esc_html( isset( $ac['v'] ) ? $ac['v'] : '' ) . ').';
	}
	echo '</p>';
}

add_action( 'admin_menu', 'novaria_ev_admin_menu' );
function novaria_ev_admin_menu() {
	add_options_page( 'Novaria Evaluator', 'Novaria Evaluator', 'manage_options', 'novaria-ev', 'novaria_ev_settings_page' );
}

add_action( 'admin_init', 'novaria_ev_admin_init' );
function novaria_ev_admin_init() {
	register_setting(
		'novaria_ev',
		NOVARIA_EV_OPT,
		array(
			'type'              => 'array',
			'sanitize_callback' => 'novaria_ev_sanitize_opts',
		)
	);
	if ( isset( $_POST['novaria_ev_refresh'] ) && current_user_can( 'manage_options' ) ) {
		check_admin_referer( 'novaria_ev_refresh' );
		delete_transient( NOVARIA_EV_DATA_TRANSIENT );
		novaria_ev_get_data( true );
		wp_safe_redirect( admin_url( 'options-general.php?page=novaria-ev&refreshed=1' ) );
		exit;
	}
}

function novaria_ev_sanitize_opts( $in ) {
	$d   = novaria_ev_defaults();
	$in  = is_array( $in ) ? $in : array();
	$out = array();
	$out['email']        = isset( $in['email'] ) && is_email( $in['email'] ) ? sanitize_email( $in['email'] ) : $d['email'];
	$out['phone']        = isset( $in['phone'] ) ? sanitize_text_field( $in['phone'] ) : $d['phone'];
	$out['whatsapp']     = isset( $in['whatsapp'] ) ? preg_replace( '/\D+/', '', $in['whatsapp'] ) : $d['whatsapp'];
	$out['data_url']     = isset( $in['data_url'] ) && wp_http_validate_url( $in['data_url'] ) ? esc_url_raw( $in['data_url'] ) : $d['data_url'];
	$out['cache_hours']  = isset( $in['cache_hours'] ) ? max( 1, min( 48, (int) $in['cache_hours'] ) ) : $d['cache_hours'];
	$out['privacy_url']  = isset( $in['privacy_url'] ) ? esc_url_raw( $in['privacy_url'] ) : $d['privacy_url'];
	$out['retention_m']  = isset( $in['retention_m'] ) ? max( 0, min( 120, (int) $in['retention_m'] ) ) : $d['retention_m'];
	$out['color_main']   = isset( $in['color_main'] ) ? novaria_ev_hex( $in['color_main'], $d['color_main'] ) : $d['color_main'];
	$out['color_accent'] = isset( $in['color_accent'] ) ? novaria_ev_hex( $in['color_accent'], $d['color_accent'] ) : $d['color_accent'];
	$out['email_client'] = empty( $in['email_client'] ) ? 0 : 1;
	$out['urmarire']     = empty( $in['urmarire'] ) ? 0 : 1;
	$out['raport_auto']  = empty( $in['raport_auto'] ) ? 0 : 1;
	$out['raport_zone']  = isset( $in['raport_zone'] ) ? implode( ',', array_filter( array_map( 'sanitize_title', explode( ',', (string) $in['raport_zone'] ) ) ) ) : $d['raport_zone'];
	$out['raport_cta_url'] = isset( $in['raport_cta_url'] ) ? esc_url_raw( $in['raport_cta_url'] ) : $d['raport_cta_url'];
	delete_transient( NOVARIA_EV_DATA_TRANSIENT );
	return $out;
}

function novaria_ev_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$o  = novaria_ev_opts();
	$d  = get_transient( NOVARIA_EV_DATA_TRANSIENT );
	if ( ! novaria_ev_valid_data( $d ) ) {
		$d = get_option( NOVARIA_EV_DATA_LASTGOOD );
	}
	$fs = (array) get_option( 'novaria_ev_fetch', array() );
	$f  = function ( $k ) use ( $o ) {
		return esc_attr( isset( $o[ $k ] ) ? $o[ $k ] : '' );
	};
	?>
	<div class="wrap">
		<h1>Novaria Evaluator</h1>
		<p>Pune <code>[novaria_evaluator]</code> pe pagina unde vrei evaluatorul. Cererile de raport detaliat apar la <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=novaria_lead' ) ); ?>">Lead-uri evaluare</a> și vin pe email.</p>
		<h2>Datele de piață</h2>
		<?php if ( isset( $_GET['refreshed'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
			<div class="notice notice-info is-dismissible"><p>Am cerut datele din nou.</p></div>
		<?php endif; ?>
		<p>
			<?php if ( novaria_ev_valid_data( $d ) ) : ?>
				Date din <b><?php echo esc_html( wp_date( 'j F Y, H:i', strtotime( $d['actualizat'] ) ) ); ?></b>, din <?php echo esc_html( number_format_i18n( (int) $d['anunturi'] ) ); ?> anunțuri, <?php echo esc_html( count( $d['zone'] ) ); ?> zone.
			<?php else : ?>
				Încă nu s-au descărcat datele; evaluatorul folosește copia inclusă în plugin.
			<?php endif; ?>
			<?php if ( ! empty( $fs['t'] ) ) : ?>
				<br>Ultima verificare: <?php echo esc_html( wp_date( 'j F Y, H:i', (int) $fs['t'] ) ); ?> — <?php echo $fs['ok'] ? 'reușită' : esc_html( 'nereușită (' . $fs['msg'] . '); se folosește ultima copie bună' ); ?>.
			<?php endif; ?>
		</p>
		<form method="post"><?php wp_nonce_field( 'novaria_ev_refresh' ); ?><button class="button" name="novaria_ev_refresh" value="1">Actualizează datele acum</button></form>
		<h2>Ultimele 30 de zile</h2>
		<?php $cv = novaria_ev_conversie( 30 ); ?>
		<p><b><?php echo (int) $cv['evaluari']; ?></b> evaluări făcute de vizitatori · <b><?php echo (int) $cv['leaduri']; ?></b> cereri cu contact<?php if ( $cv['evaluari'] ) : ?> (<?php echo esc_html( number_format_i18n( 100 * $cv['leaduri'] / max( 1, $cv['evaluari'] ), 0 ) ); ?>% conversie)<?php endif; ?> · <b><?php echo (int) $cv['emailuri']; ?></b> cu email (intră în urmărirea la 30/60/90 de zile) · <b><?php echo (int) $cv['urmariri']; ?></b> mesaje de urmărire trimise.</p>
		<h2>Setări</h2>
		<form method="post" action="options.php">
			<?php settings_fields( 'novaria_ev' ); ?>
			<table class="form-table" role="presentation">
				<tr><th scope="row"><label for="nv-email">Email pentru lead-uri</label></th><td><input id="nv-email" type="email" class="regular-text" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[email]" value="<?php echo $f( 'email' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>"></td></tr>
				<tr><th scope="row">Email către client</th><td><label><input type="checkbox" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[email_client]" value="1" <?php checked( ! empty( $o['email_client'] ) ); ?>> Dacă își lasă adresa, îi trimitem estimarea pe email (Reply-To: emailul pentru lead-uri)</label></td></tr>
				<tr><th scope="row"><label for="nv-phone">Telefon afișat</label></th><td><input id="nv-phone" type="text" class="regular-text" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[phone]" value="<?php echo $f( 'phone' ); // phpcs:ignore ?>"></td></tr>
				<tr><th scope="row"><label for="nv-wa">WhatsApp (cu prefix țară, doar cifre)</label></th><td><input id="nv-wa" type="text" class="regular-text" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[whatsapp]" value="<?php echo $f( 'whatsapp' ); // phpcs:ignore ?>"></td></tr>
				<tr><th scope="row"><label for="nv-priv">Pagina de confidențialitate</label></th><td><input id="nv-priv" type="url" class="regular-text" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[privacy_url]" value="<?php echo $f( 'privacy_url' ); // phpcs:ignore ?>"></td></tr>
				<tr><th scope="row"><label for="nv-ret">Păstrează lead-urile (luni)</label></th><td><input id="nv-ret" type="number" min="0" max="120" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[retention_m]" value="<?php echo $f( 'retention_m' ); // phpcs:ignore ?>"> <span class="description">Lead-urile mai vechi se șterg automat. 0 = nu se șterg.</span></td></tr>
				<tr><th scope="row"><label for="nv-c1">Culoare principală</label></th><td><input id="nv-c1" type="text" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[color_main]" value="<?php echo $f( 'color_main' ); // phpcs:ignore ?>"> <label for="nv-c2" style="margin-left:12px">Accent</label> <input id="nv-c2" type="text" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[color_accent]" value="<?php echo $f( 'color_accent' ); // phpcs:ignore ?>"></td></tr>
				<tr><th scope="row"><label for="nv-url">Adresa datelor</label></th><td><input id="nv-url" type="url" class="large-text code" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[data_url]" value="<?php echo $f( 'data_url' ); // phpcs:ignore ?>"><p class="description">Fișierul actualizat zilnic de Novaria. Nu-l schimba decât dacă muți depozitul.</p></td></tr>
				<tr><th scope="row">Cheia pentru aplicația internă</th><td><code><?php echo esc_html( novaria_ev_api_key() ); ?></code><p class="description">Se pune în aplicația Novaria Evaluator (Setări → „Evaluările de pe site”), ca să vadă acolo cererile și evaluările făcute de vizitatori. Nu o publica.</p></td></tr>
				<tr><th scope="row">Urmărire după evaluare</th><td><label><input type="checkbox" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[urmarire]" value="1" <?php checked( ! empty( $o['urmarire'] ) ); ?>> La 30, 60 și 90 de zile după o cerere cu email, vizitatorul primește „ce s-a schimbat în zona ta” (prețul median acum față de atunci, anunțuri noi, estimarea actualizată) și invitația la evaluarea completă. Fiecare mesaj are link de dezabonare.</label></td></tr>
				<tr><th scope="row"><label for="nv-rz">Rapoarte lunare de piață</label></th><td><input id="nv-rz" type="text" class="large-text code" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[raport_zone]" value="<?php echo $f( 'raport_zone' ); // phpcs:ignore ?>"><p class="description">Id-urile zonelor, separate cu virgulă (ex. bragadiru, domnesti, drumul-taberei). În prima zi a fiecărei luni se creează câte un articol „Piața imobiliară în …” pentru fiecare zonă, în categoria „Piața imobiliară”, cu shortcode-ul <code>[novaria_raport zona="…"]</code> (poți pune shortcode-ul și singur, pe orice pagină). Lasă gol ca să oprești.</p><label><input type="checkbox" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[raport_auto]" value="1" <?php checked( ! empty( $o['raport_auto'] ) ); ?>> Publică articolele automat (altfel rămân ciorne și primești email să le publici)</label></td></tr>
				<tr><th scope="row"><label for="nv-cta">Pagina evaluatorului (butonul din rapoarte)</label></th><td><input id="nv-cta" type="url" class="regular-text" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[raport_cta_url]" value="<?php echo $f( 'raport_cta_url' ); // phpcs:ignore ?>"></td></tr>
				<tr><th scope="row"><label for="nv-ch">Verifică datele la fiecare (ore)</label></th><td><input id="nv-ch" type="number" min="1" max="48" name="<?php echo esc_attr( NOVARIA_EV_OPT ); ?>[cache_hours]" value="<?php echo $f( 'cache_hours' ); // phpcs:ignore ?>"></td></tr>
			</table>
			<?php submit_button( 'Salvează' ); ?>
		</form>
	</div>
	<?php
}

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'novaria_ev_action_links' );
function novaria_ev_action_links( $l ) {
	array_unshift( $l, '<a href="' . esc_url( admin_url( 'options-general.php?page=novaria-ev' ) ) . '">Setări</a>' );
	return $l;
}

/* ------------------------------------------------------------------ */
/* Păstrarea datelor (GDPR): ștergere automată + export/ștergere la cerere */
/* ------------------------------------------------------------------ */

register_activation_hook( __FILE__, 'novaria_ev_activate' );
function novaria_ev_activate() {
	novaria_ev_register_cpt();
	if ( ! wp_next_scheduled( 'novaria_ev_daily' ) ) {
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'novaria_ev_daily' );
	}
	if ( false === get_option( NOVARIA_EV_OPT, false ) ) {
		add_option( NOVARIA_EV_OPT, novaria_ev_defaults() );
	}
	novaria_ev_api_key();
}
register_deactivation_hook( __FILE__, 'novaria_ev_deactivate' );
function novaria_ev_deactivate() {
	wp_clear_scheduled_hook( 'novaria_ev_daily' );
}

add_action( 'novaria_ev_daily', 'novaria_ev_cleanup' );
function novaria_ev_cleanup() {
	// evaluările anonime se păstrează 6 luni
	$olde = get_posts(
		array(
			'post_type'      => 'novaria_eval',
			'post_status'    => 'any',
			'posts_per_page' => 300,
			'fields'         => 'ids',
			'date_query'     => array( array( 'before' => gmdate( 'Y-m-d', strtotime( '-6 months' ) ) ) ),
		)
	);
	foreach ( $olde as $id ) {
		wp_delete_post( $id, true );
	}
	$m = (int) novaria_ev_opts()['retention_m'];
	if ( $m <= 0 ) {
		return;
	}
	$old = get_posts(
		array(
			'post_type'      => 'novaria_lead',
			'post_status'    => 'any',
			'posts_per_page' => 200,
			'fields'         => 'ids',
			'date_query'     => array( array( 'before' => gmdate( 'Y-m-d', strtotime( '-' . $m . ' months' ) ) ) ),
		)
	);
	foreach ( $old as $id ) {
		wp_delete_post( $id, true );
	}
}

/** Evaluările, cererile și mesajele de urmărire din ultimele N zile (pentru pagina de setări). */
function novaria_ev_conversie( $zile ) {
	$after = gmdate( 'Y-m-d H:i:s', time() - $zile * DAY_IN_SECONDS );
	$q = function ( $type ) use ( $after ) {
		return (int) ( new WP_Query( array( 'post_type' => $type, 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'date_query' => array( array( 'after' => $after ) ), 'no_found_rows' => false ) ) )->found_posts;
	};
	$ev = $q( 'novaria_eval' );
	$ld = $q( 'novaria_lead' );
	$em = (int) ( new WP_Query( array( 'post_type' => 'novaria_lead', 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'date_query' => array( array( 'after' => $after ) ), 'meta_query' => array( array( 'key' => '_novaria_email', 'value' => '@', 'compare' => 'LIKE' ) ), 'no_found_rows' => false ) ) )->found_posts;
	$ur = 0;
	foreach ( array( 30, 60, 90 ) as $z ) {
		$ur += (int) ( new WP_Query( array( 'post_type' => 'novaria_lead', 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_query' => array( array( 'key' => '_novaria_urmarire_' . $z, 'value' => $after, 'compare' => '>=' ) ), 'no_found_rows' => false ) ) )->found_posts;
	}
	// evaluările anonime includ și sesiunile care au devenit cereri (același vizitator): le numărăm o dată
	return array( 'evaluari' => $ev + $ld, 'leaduri' => $ld, 'emailuri' => $em, 'urmariri' => $ur );
}

function novaria_ev_leads_by_email( $email ) {
	return get_posts(
		array(
			'post_type'      => 'novaria_lead',
			'post_status'    => 'any',
			'posts_per_page' => 100,
			'fields'         => 'ids',
			'meta_key'       => '_novaria_email', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'     => $email, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
}

add_filter( 'wp_privacy_personal_data_exporters', 'novaria_ev_reg_exporter' );
function novaria_ev_reg_exporter( $ex ) {
	$ex['novaria-evaluator'] = array(
		'exporter_friendly_name' => 'Novaria Evaluator — cereri de evaluare',
		'callback'               => 'novaria_ev_exporter',
	);
	return $ex;
}
function novaria_ev_exporter( $email, $page = 1 ) {
	$items = array();
	foreach ( novaria_ev_leads_by_email( $email ) as $id ) {
		$items[] = array(
			'group_id'    => 'novaria-ev-leads',
			'group_label' => 'Cereri de evaluare',
			'item_id'     => 'novaria-lead-' . $id,
			'data'        => array(
				array( 'name' => 'Data', 'value' => get_the_date( 'Y-m-d H:i', $id ) ),
				array( 'name' => 'Detalii', 'value' => implode( "\n", novaria_ev_lead_lines( $id ) ) ),
			),
		);
	}
	return array( 'data' => $items, 'done' => true );
}
add_filter( 'wp_privacy_personal_data_erasers', 'novaria_ev_reg_eraser' );
function novaria_ev_reg_eraser( $er ) {
	$er['novaria-evaluator'] = array(
		'eraser_friendly_name' => 'Novaria Evaluator — cereri de evaluare',
		'callback'             => 'novaria_ev_eraser',
	);
	return $er;
}
function novaria_ev_eraser( $email, $page = 1 ) {
	$ids = novaria_ev_leads_by_email( $email );
	foreach ( $ids as $id ) {
		wp_delete_post( $id, true );
	}
	return array( 'items_removed' => count( $ids ) > 0, 'items_retained' => false, 'messages' => array(), 'done' => true );
}
