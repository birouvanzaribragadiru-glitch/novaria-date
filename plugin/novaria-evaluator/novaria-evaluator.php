<?php
/**
 * Plugin Name:       Novaria Evaluator
 * Plugin URI:        https://novaria.ro/evaluare-gratuita/
 * Description:       Evaluator online pentru apartamente, case și terenuri din București și Ilfov. Datele de piață se actualizează automat (anunțuri monitorizate de Novaria + indici de piață). Pune [novaria_evaluator] pe orice pagină. Cererile de raport detaliat se salvează la „Lead-uri evaluare” și vin pe email.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Novaria
 * Text Domain:       novaria-evaluator
 * License:           GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'NV_EVAL_VER', '1.0.0' );
define( 'NV_EVAL_FILE', __FILE__ );
define( 'NV_EVAL_DIR', plugin_dir_path( __FILE__ ) );
define( 'NV_EVAL_URL', plugin_dir_url( __FILE__ ) );
define( 'NV_EVAL_OPT', 'nv_eval_opts' );
define( 'NV_EVAL_DATA_TRANSIENT', 'nv_eval_data' );
define( 'NV_EVAL_DATA_LASTGOOD', 'nv_eval_data_lastgood' );
define( 'NV_EVAL_CONSENT_VER', '2026-10' );

/* ------------------------------------------------------------------ */
/* Setări                                                              */
/* ------------------------------------------------------------------ */

function nv_eval_defaults() {
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
	);
}

function nv_eval_opts() {
	$o = get_option( NV_EVAL_OPT, array() );
	return wp_parse_args( is_array( $o ) ? $o : array(), nv_eval_defaults() );
}

function nv_eval_hex( $c, $fallback ) {
	$c = sanitize_hex_color( $c );
	return $c ? $c : $fallback;
}

/* ------------------------------------------------------------------ */
/* Date de piață: GitHub → cache → ultima copie bună → fișierul inclus */
/* ------------------------------------------------------------------ */

function nv_eval_valid_data( $d ) {
	return is_array( $d ) && isset( $d['v'], $d['zone'] ) && 1 === (int) $d['v'] && is_array( $d['zone'] ) && count( $d['zone'] ) > 20;
}

function nv_eval_bundled_data() {
	$f = NV_EVAL_DIR . 'data/evaluator.json';
	if ( ! is_readable( $f ) ) {
		return null;
	}
	$d = json_decode( (string) file_get_contents( $f ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	return nv_eval_valid_data( $d ) ? $d : null;
}

/**
 * Întoarce datele curente. $force = true ignoră cache-ul (butonul din setări).
 * Nu aruncă niciodată eroare către vizitator: dacă GitHub nu răspunde, folosește ultima copie bună.
 */
function nv_eval_get_data( $force = false ) {
	if ( ! $force ) {
		$c = get_transient( NV_EVAL_DATA_TRANSIENT );
		if ( nv_eval_valid_data( $c ) ) {
			return $c;
		}
	}
	$o   = nv_eval_opts();
	$url = esc_url_raw( $o['data_url'] );
	$d   = null;
	$err = '';
	if ( $url ) {
		$r = wp_remote_get(
			add_query_arg( 't', floor( time() / 600 ), $url ),
			array(
				'timeout'    => 8,
				'user-agent' => 'NovariaEvaluator/' . NV_EVAL_VER . '; ' . home_url(),
			)
		);
		if ( is_wp_error( $r ) ) {
			$err = $r->get_error_message();
		} elseif ( 200 !== (int) wp_remote_retrieve_response_code( $r ) ) {
			$err = 'HTTP ' . wp_remote_retrieve_response_code( $r );
		} else {
			$j = json_decode( wp_remote_retrieve_body( $r ), true );
			if ( nv_eval_valid_data( $j ) ) {
				$d = $j;
			} else {
				$err = 'fișier invalid';
			}
		}
	}
	$hours = max( 1, min( 48, (int) $o['cache_hours'] ) );
	if ( $d ) {
		set_transient( NV_EVAL_DATA_TRANSIENT, $d, $hours * HOUR_IN_SECONDS );
		update_option( NV_EVAL_DATA_LASTGOOD, $d, false );
		update_option( 'nv_eval_fetch', array( 'ok' => 1, 't' => time(), 'msg' => '' ), false );
		return $d;
	}
	update_option( 'nv_eval_fetch', array( 'ok' => 0, 't' => time(), 'msg' => $err ), false );
	$last = get_option( NV_EVAL_DATA_LASTGOOD );
	if ( ! nv_eval_valid_data( $last ) ) {
		$last = nv_eval_bundled_data();
	}
	if ( $last ) {
		// reîncearcă peste o oră, nu la fiecare vizitator
		set_transient( NV_EVAL_DATA_TRANSIENT, $last, HOUR_IN_SECONDS );
	}
	return $last;
}

/* ------------------------------------------------------------------ */
/* Shortcode + resurse                                                 */
/* ------------------------------------------------------------------ */

add_action( 'wp_enqueue_scripts', 'nv_eval_register_assets' );
function nv_eval_register_assets() {
	$v = NV_EVAL_VER;
	wp_register_style( 'nv-eval', NV_EVAL_URL . 'assets/widget.css', array(), $v );
	wp_register_script( 'nv-eval-engine', NV_EVAL_URL . 'assets/engine.js', array(), $v, true );
	wp_register_script( 'nv-eval-zcombo', NV_EVAL_URL . 'assets/zcombo.js', array(), $v, true );
	wp_register_script( 'nv-eval', NV_EVAL_URL . 'assets/widget.js', array( 'nv-eval-engine', 'nv-eval-zcombo' ), $v, true );
}

add_shortcode( 'novaria_evaluator', 'nv_eval_shortcode' );
function nv_eval_shortcode( $atts ) {
	$o = nv_eval_opts();
	// temele bloc (FSE) randează conținutul înainte de wp_enqueue_scripts: ne asigurăm că resursele sunt înregistrate
	if ( ! wp_script_is( 'nv-eval', 'registered' ) ) {
		nv_eval_register_assets();
	}
	wp_enqueue_style( 'nv-eval' );
	wp_enqueue_script( 'nv-eval' );
	$cfg = array(
		'dataUrl'    => esc_url_raw( rest_url( 'novaria/v1/date' ) ),
		'leadUrl'    => esc_url_raw( rest_url( 'novaria/v1/lead' ) ),
		'ajaxUrl'    => esc_url_raw( admin_url( 'admin-ajax.php' ) ),
		'bundledUrl' => esc_url_raw( NV_EVAL_URL . 'data/evaluator.json?v=' . NV_EVAL_VER ),
		'phone'      => (string) $o['phone'],
		'whatsapp'   => preg_replace( '/\D+/', '', (string) $o['whatsapp'] ),
		'privacyUrl' => esc_url_raw( $o['privacy_url'] ),
		'consentVer' => NV_EVAL_CONSENT_VER,
	);
	// configurația stă pe element (nu într-un script separat), ca să meargă și cu plugin-uri de cache/optimizare JS
	$main   = nv_eval_hex( $o['color_main'], '#13233F' );
	$accent = nv_eval_hex( $o['color_accent'], '#A07B2C' );
	$style  = '--nv-main:' . $main . ';--nv-accent:' . $accent . ';';
	ob_start();
	?>
	<div class="nv-eval" id="nv-eval" style="<?php echo esc_attr( $style ); ?>" data-cfg="<?php echo esc_attr( wp_json_encode( $cfg ) ); ?>">
		<div class="nv-eval-loading" role="status"><span class="nv-spin" aria-hidden="true"></span> Se încarcă evaluatorul…</div>
		<noscript><p>Evaluatorul are nevoie de JavaScript. Ne poți suna la <a href="tel:<?php echo esc_attr( preg_replace( '/\s+/', '', $o['phone'] ) ); ?>"><?php echo esc_html( $o['phone'] ); ?></a> pentru o evaluare gratuită.</p></noscript>
	</div>
	<?php
	return ob_get_clean();
}

/* ------------------------------------------------------------------ */
/* Lead-uri: tip de conținut privat                                    */
/* ------------------------------------------------------------------ */

add_action( 'init', 'nv_eval_register_cpt' );
function nv_eval_register_cpt() {
	register_post_type(
		'nv_lead',
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
}

/* ------------------------------------------------------------------ */
/* REST API (+ variantă admin-ajax dacă REST e blocat de un plugin)     */
/* ------------------------------------------------------------------ */

add_action( 'rest_api_init', 'nv_eval_rest' );
function nv_eval_rest() {
	register_rest_route(
		'novaria/v1',
		'/date',
		array(
			'methods'             => 'GET',
			'callback'            => 'nv_eval_rest_data',
			'permission_callback' => '__return_true',
		)
	);
	register_rest_route(
		'novaria/v1',
		'/lead',
		array(
			'methods'             => 'POST',
			'callback'            => 'nv_eval_rest_lead',
			'permission_callback' => '__return_true',
		)
	);
}

function nv_eval_rest_data() {
	$d = nv_eval_get_data();
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

function nv_eval_rest_lead( WP_REST_Request $req ) {
	$p = $req->get_json_params();
	if ( ! is_array( $p ) ) {
		$p = $req->get_body_params();
	}
	$res = nv_eval_handle_lead( is_array( $p ) ? $p : array() );
	return new WP_REST_Response( $res['body'], $res['code'] );
}

add_action( 'wp_ajax_nopriv_nv_eval_lead', 'nv_eval_ajax_lead' );
add_action( 'wp_ajax_nv_eval_lead', 'nv_eval_ajax_lead' );
function nv_eval_ajax_lead() {
	$raw = isset( $_POST['payload'] ) ? wp_unslash( $_POST['payload'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- formular public, protejat cu honeypot + limită; câmpurile se curăță individual mai jos.
	$p   = json_decode( (string) $raw, true );
	$res = nv_eval_handle_lead( is_array( $p ) ? $p : array() );
	wp_send_json( $res['body'], $res['code'] );
}

add_action( 'wp_ajax_nopriv_nv_eval_data', 'nv_eval_ajax_data' );
add_action( 'wp_ajax_nv_eval_data', 'nv_eval_ajax_data' );
function nv_eval_ajax_data() {
	$d = nv_eval_get_data();
	wp_send_json( $d ? $d : array( 'error' => 'indisponibil' ), $d ? 200 : 503 );
}

function nv_eval_client_key() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	return substr( hash_hmac( 'sha256', $ip, wp_salt( 'nonce' ) ), 0, 20 );
}

function nv_eval_clean_num( $v, $min, $max ) {
	if ( ! is_numeric( $v ) ) {
		return null;
	}
	$v = (float) $v;
	return ( $v >= $min && $v <= $max ) ? $v : null;
}

/** Câmpurile proprietății acceptate (restul se ignoră). */
function nv_eval_subject_keys() {
	return array( 'tip', 'zona', 'mp', 'camere', 'an', 'etaj', 'etajeTotal', 'lift', 'stare', 'compart', 'incalzire', 'balcon', 'parcareNr', 'parcareTip', 'metrou', 'seismic', 'anvelopat', 'juridic', 'teren', 'tipCasa', 'structura', 'regim', 'front', 'utilCanal', 'utilGaz', 'asfalt', 'garaj', 'intravilan', 'utilApa', 'utilCanalT', 'utilGazT', 'utilCurent', 'acces', 'destinatie' );
}

function nv_eval_handle_lead( $p ) {
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
	$k  = 'nv_eval_rl_' . nv_eval_client_key();
	$n  = (int) get_transient( $k );
	$gk = 'nv_eval_rl_all';
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
	$pagina = isset( $p['pagina'] ) ? esc_url_raw( substr( (string) $p['pagina'], 0, 300 ) ) : '';

	$s_in = isset( $p['proprietate'] ) && is_array( $p['proprietate'] ) ? $p['proprietate'] : array();
	$s    = array();
	foreach ( nv_eval_subject_keys() as $key ) {
		if ( ! isset( $s_in[ $key ] ) || '' === $s_in[ $key ] || null === $s_in[ $key ] ) {
			continue;
		}
		$v = $s_in[ $key ];
		if ( is_bool( $v ) ) {
			$s[ $key ] = $v;
		} elseif ( is_numeric( $v ) ) {
			$s[ $key ] = 0 + $v;
		} else {
			$s[ $key ] = sanitize_text_field( substr( (string) $v, 0, 40 ) );
		}
	}
	$tip  = isset( $s['tip'] ) && in_array( $s['tip'], array( 'apartament', 'casa', 'teren' ), true ) ? $s['tip'] : '';
	$zona = isset( $p['zonaNume'] ) ? sanitize_text_field( substr( (string) $p['zonaNume'], 0, 80 ) ) : '';
	$mp   = isset( $s['mp'] ) ? nv_eval_clean_num( $s['mp'], 5, 100000 ) : null;

	$e_in = isset( $p['estimare'] ) && is_array( $p['estimare'] ) ? $p['estimare'] : array();
	$est  = array();
	foreach ( array( 'min', 'max', 'realist', 'rapid', 'listare', 'ppm' ) as $key ) {
		if ( isset( $e_in[ $key ] ) ) {
			$v = nv_eval_clean_num( $e_in[ $key ], 0, 50000000 );
			if ( null !== $v ) {
				$est[ $key ] = round( $v );
			}
		}
	}

	$tip_lbl = array( 'apartament' => 'Apartament', 'casa' => 'Casă', 'teren' => 'Teren' );
	$title   = trim( ( $tip ? $tip_lbl[ $tip ] : 'Proprietate' ) . ( $mp ? ' ' . round( $mp ) . ' mp' : '' ) . ( $zona ? ', ' . $zona : '' ) . ' — ' . $tel );
	$post_id = wp_insert_post(
		array(
			'post_type'   => 'nv_lead',
			'post_status' => 'private',
			'post_title'  => $title,
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return $fail( 'Nu am putut salva cererea. Te rugăm să ne suni.', 500 );
	}
	update_post_meta( $post_id, '_nv_telefon', $tel );
	update_post_meta( $post_id, '_nv_nume', $nume );
	update_post_meta( $post_id, '_nv_email', $email );
	update_post_meta( $post_id, '_nv_mesaj', $mesaj );
	update_post_meta( $post_id, '_nv_zona', $zona );
	update_post_meta( $post_id, '_nv_tip', $tip );
	update_post_meta( $post_id, '_nv_prop', $s );
	update_post_meta( $post_id, '_nv_est', $est );
	update_post_meta( $post_id, '_nv_pagina', $pagina );
	update_post_meta( $post_id, '_nv_acord', array( 'v' => NV_EVAL_CONSENT_VER, 't' => current_time( 'mysql' ) ) );
	update_post_meta( $post_id, '_nv_data_ver', isset( $p['dateVer'] ) ? sanitize_text_field( substr( (string) $p['dateVer'], 0, 40 ) ) : '' );

	set_transient( $k, $n + 1, HOUR_IN_SECONDS );
	set_transient( $gk, $gn + 1, HOUR_IN_SECONDS );

	nv_eval_mail_lead( $post_id );
	return array( 'code' => 200, 'body' => array( 'ok' => true ) );
}

function nv_eval_fmt_eur( $v ) {
	return number_format( (float) $v, 0, ',', '.' ) . ' €';
}

function nv_eval_lead_lines( $post_id ) {
	$s   = (array) get_post_meta( $post_id, '_nv_prop', true );
	$est = (array) get_post_meta( $post_id, '_nv_est', true );
	$L   = array();
	$L[] = 'Telefon: ' . get_post_meta( $post_id, '_nv_telefon', true );
	$nm  = get_post_meta( $post_id, '_nv_nume', true );
	$em  = get_post_meta( $post_id, '_nv_email', true );
	if ( $nm ) {
		$L[] = 'Nume: ' . $nm;
	}
	if ( $em ) {
		$L[] = 'Email: ' . $em;
	}
	$L[] = '';
	$L[] = 'Proprietatea: ' . get_the_title( $post_id );
	$labels = array(
		'camere' => 'Camere', 'an' => 'An construcție', 'etaj' => 'Etaj', 'etajeTotal' => 'Din etaje', 'stare' => 'Stare',
		'parcareNr' => 'Locuri parcare', 'parcareTip' => 'Tip parcare', 'teren' => 'Teren (mp)', 'tipCasa' => 'Tip casă',
		'compart' => 'Compartimentare', 'incalzire' => 'Încălzire', 'balcon' => 'Balcon', 'metrou' => 'Metrou (min)',
		'seismic' => 'Seismic', 'juridic' => 'Juridic', 'intravilan' => 'Intravilan', 'front' => 'Front (m)', 'structura' => 'Structură', 'regim' => 'Regim',
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
		$L[] = 'Estimare afișată: ' . nv_eval_fmt_eur( $est['min'] ) . ' – ' . nv_eval_fmt_eur( $est['max'] );
		if ( isset( $est['realist'] ) ) {
			$L[] = '  Preț realist: ' . nv_eval_fmt_eur( $est['realist'] ) . ( isset( $est['ppm'] ) ? ' (' . nv_eval_fmt_eur( $est['ppm'] ) . '/mp)' : '' );
		}
		if ( isset( $est['rapid'], $est['listare'] ) ) {
			$L[] = '  Rapid: ' . nv_eval_fmt_eur( $est['rapid'] ) . ' · Listare: ' . nv_eval_fmt_eur( $est['listare'] );
		}
	}
	$m = get_post_meta( $post_id, '_nv_mesaj', true );
	if ( $m ) {
		$L[] = '';
		$L[] = 'Mesaj: ' . $m;
	}
	return $L;
}

function nv_eval_mail_lead( $post_id ) {
	$o  = nv_eval_opts();
	$to = is_email( $o['email'] ) ? $o['email'] : get_option( 'admin_email' );
	$L  = nv_eval_lead_lines( $post_id );
	$L[] = '';
	$L[] = 'Vezi lead-ul: ' . admin_url( 'post.php?post=' . (int) $post_id . '&action=edit' );
	$headers = array( 'Content-Type: text/plain; charset=UTF-8' );
	$em      = get_post_meta( $post_id, '_nv_email', true );
	if ( $em && is_email( $em ) ) {
		$headers[] = 'Reply-To: ' . $em;
	}
	wp_mail( $to, 'Lead evaluare: ' . get_the_title( $post_id ), implode( "\n", $L ), $headers );
}

/* ------------------------------------------------------------------ */
/* Admin: coloane, detalii, setări                                      */
/* ------------------------------------------------------------------ */

add_filter( 'manage_nv_lead_posts_columns', 'nv_eval_cols' );
function nv_eval_cols( $c ) {
	return array(
		'cb'       => isset( $c['cb'] ) ? $c['cb'] : '',
		'title'    => 'Proprietate',
		'nv_tel'   => 'Telefon',
		'nv_nume'  => 'Nume',
		'nv_est'   => 'Estimare',
		'date'     => 'Data',
	);
}
add_action( 'manage_nv_lead_posts_custom_column', 'nv_eval_col', 10, 2 );
function nv_eval_col( $col, $post_id ) {
	if ( 'nv_tel' === $col ) {
		$t = get_post_meta( $post_id, '_nv_telefon', true );
		echo '<a href="tel:' . esc_attr( preg_replace( '/[^\d+]/', '', $t ) ) . '">' . esc_html( $t ) . '</a>';
	} elseif ( 'nv_nume' === $col ) {
		echo esc_html( get_post_meta( $post_id, '_nv_nume', true ) );
	} elseif ( 'nv_est' === $col ) {
		$e = (array) get_post_meta( $post_id, '_nv_est', true );
		if ( isset( $e['min'], $e['max'] ) ) {
			echo esc_html( nv_eval_fmt_eur( $e['min'] ) . ' – ' . nv_eval_fmt_eur( $e['max'] ) );
		}
	}
}

add_action( 'add_meta_boxes_nv_lead', 'nv_eval_metabox' );
function nv_eval_metabox() {
	add_meta_box( 'nv_lead_det', 'Detalii cerere', 'nv_eval_metabox_html', 'nv_lead', 'normal', 'high' );
}
function nv_eval_metabox_html( $post ) {
	echo '<pre style="white-space:pre-wrap;font:14px/1.6 system-ui,sans-serif;margin:0">' . esc_html( implode( "\n", nv_eval_lead_lines( $post->ID ) ) ) . '</pre>';
	$pg = get_post_meta( $post->ID, '_nv_pagina', true );
	$ac = (array) get_post_meta( $post->ID, '_nv_acord', true );
	echo '<p style="color:#646970">';
	if ( $pg ) {
		echo 'Trimis de pe: ' . esc_html( $pg ) . '<br>';
	}
	if ( ! empty( $ac['t'] ) ) {
		echo 'Acord de contactare dat la ' . esc_html( $ac['t'] ) . ' (text versiunea ' . esc_html( isset( $ac['v'] ) ? $ac['v'] : '' ) . ').';
	}
	echo '</p>';
}

add_action( 'admin_menu', 'nv_eval_admin_menu' );
function nv_eval_admin_menu() {
	add_options_page( 'Novaria Evaluator', 'Novaria Evaluator', 'manage_options', 'nv-eval', 'nv_eval_settings_page' );
}

add_action( 'admin_init', 'nv_eval_admin_init' );
function nv_eval_admin_init() {
	register_setting(
		'nv_eval',
		NV_EVAL_OPT,
		array(
			'type'              => 'array',
			'sanitize_callback' => 'nv_eval_sanitize_opts',
		)
	);
	if ( isset( $_POST['nv_eval_refresh'] ) && current_user_can( 'manage_options' ) ) {
		check_admin_referer( 'nv_eval_refresh' );
		delete_transient( NV_EVAL_DATA_TRANSIENT );
		nv_eval_get_data( true );
		wp_safe_redirect( admin_url( 'options-general.php?page=nv-eval&refreshed=1' ) );
		exit;
	}
}

function nv_eval_sanitize_opts( $in ) {
	$d   = nv_eval_defaults();
	$in  = is_array( $in ) ? $in : array();
	$out = array();
	$out['email']        = isset( $in['email'] ) && is_email( $in['email'] ) ? sanitize_email( $in['email'] ) : $d['email'];
	$out['phone']        = isset( $in['phone'] ) ? sanitize_text_field( $in['phone'] ) : $d['phone'];
	$out['whatsapp']     = isset( $in['whatsapp'] ) ? preg_replace( '/\D+/', '', $in['whatsapp'] ) : $d['whatsapp'];
	$out['data_url']     = isset( $in['data_url'] ) && wp_http_validate_url( $in['data_url'] ) ? esc_url_raw( $in['data_url'] ) : $d['data_url'];
	$out['cache_hours']  = isset( $in['cache_hours'] ) ? max( 1, min( 48, (int) $in['cache_hours'] ) ) : $d['cache_hours'];
	$out['privacy_url']  = isset( $in['privacy_url'] ) ? esc_url_raw( $in['privacy_url'] ) : $d['privacy_url'];
	$out['retention_m']  = isset( $in['retention_m'] ) ? max( 0, min( 120, (int) $in['retention_m'] ) ) : $d['retention_m'];
	$out['color_main']   = isset( $in['color_main'] ) ? nv_eval_hex( $in['color_main'], $d['color_main'] ) : $d['color_main'];
	$out['color_accent'] = isset( $in['color_accent'] ) ? nv_eval_hex( $in['color_accent'], $d['color_accent'] ) : $d['color_accent'];
	delete_transient( NV_EVAL_DATA_TRANSIENT );
	return $out;
}

function nv_eval_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$o  = nv_eval_opts();
	$d  = get_transient( NV_EVAL_DATA_TRANSIENT );
	if ( ! nv_eval_valid_data( $d ) ) {
		$d = get_option( NV_EVAL_DATA_LASTGOOD );
	}
	$fs = (array) get_option( 'nv_eval_fetch', array() );
	$f  = function ( $k ) use ( $o ) {
		return esc_attr( isset( $o[ $k ] ) ? $o[ $k ] : '' );
	};
	?>
	<div class="wrap">
		<h1>Novaria Evaluator</h1>
		<p>Pune <code>[novaria_evaluator]</code> pe pagina unde vrei evaluatorul. Cererile de raport detaliat apar la <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=nv_lead' ) ); ?>">Lead-uri evaluare</a> și vin pe email.</p>
		<h2>Datele de piață</h2>
		<?php if ( isset( $_GET['refreshed'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
			<div class="notice notice-info is-dismissible"><p>Am cerut datele din nou.</p></div>
		<?php endif; ?>
		<p>
			<?php if ( nv_eval_valid_data( $d ) ) : ?>
				Date din <b><?php echo esc_html( wp_date( 'j F Y, H:i', strtotime( $d['actualizat'] ) ) ); ?></b>, din <?php echo esc_html( number_format_i18n( (int) $d['anunturi'] ) ); ?> anunțuri, <?php echo esc_html( count( $d['zone'] ) ); ?> zone.
			<?php else : ?>
				Încă nu s-au descărcat datele; evaluatorul folosește copia inclusă în plugin.
			<?php endif; ?>
			<?php if ( ! empty( $fs['t'] ) ) : ?>
				<br>Ultima verificare: <?php echo esc_html( wp_date( 'j F Y, H:i', (int) $fs['t'] ) ); ?> — <?php echo $fs['ok'] ? 'reușită' : esc_html( 'nereușită (' . $fs['msg'] . '); se folosește ultima copie bună' ); ?>.
			<?php endif; ?>
		</p>
		<form method="post"><?php wp_nonce_field( 'nv_eval_refresh' ); ?><button class="button" name="nv_eval_refresh" value="1">Actualizează datele acum</button></form>
		<h2>Setări</h2>
		<form method="post" action="options.php">
			<?php settings_fields( 'nv_eval' ); ?>
			<table class="form-table" role="presentation">
				<tr><th scope="row"><label for="nv-email">Email pentru lead-uri</label></th><td><input id="nv-email" type="email" class="regular-text" name="<?php echo esc_attr( NV_EVAL_OPT ); ?>[email]" value="<?php echo $f( 'email' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>"></td></tr>
				<tr><th scope="row"><label for="nv-phone">Telefon afișat</label></th><td><input id="nv-phone" type="text" class="regular-text" name="<?php echo esc_attr( NV_EVAL_OPT ); ?>[phone]" value="<?php echo $f( 'phone' ); // phpcs:ignore ?>"></td></tr>
				<tr><th scope="row"><label for="nv-wa">WhatsApp (cu prefix țară, doar cifre)</label></th><td><input id="nv-wa" type="text" class="regular-text" name="<?php echo esc_attr( NV_EVAL_OPT ); ?>[whatsapp]" value="<?php echo $f( 'whatsapp' ); // phpcs:ignore ?>"></td></tr>
				<tr><th scope="row"><label for="nv-priv">Pagina de confidențialitate</label></th><td><input id="nv-priv" type="url" class="regular-text" name="<?php echo esc_attr( NV_EVAL_OPT ); ?>[privacy_url]" value="<?php echo $f( 'privacy_url' ); // phpcs:ignore ?>"></td></tr>
				<tr><th scope="row"><label for="nv-ret">Păstrează lead-urile (luni)</label></th><td><input id="nv-ret" type="number" min="0" max="120" name="<?php echo esc_attr( NV_EVAL_OPT ); ?>[retention_m]" value="<?php echo $f( 'retention_m' ); // phpcs:ignore ?>"> <span class="description">Lead-urile mai vechi se șterg automat. 0 = nu se șterg.</span></td></tr>
				<tr><th scope="row"><label for="nv-c1">Culoare principală</label></th><td><input id="nv-c1" type="text" name="<?php echo esc_attr( NV_EVAL_OPT ); ?>[color_main]" value="<?php echo $f( 'color_main' ); // phpcs:ignore ?>"> <label for="nv-c2" style="margin-left:12px">Accent</label> <input id="nv-c2" type="text" name="<?php echo esc_attr( NV_EVAL_OPT ); ?>[color_accent]" value="<?php echo $f( 'color_accent' ); // phpcs:ignore ?>"></td></tr>
				<tr><th scope="row"><label for="nv-url">Adresa datelor</label></th><td><input id="nv-url" type="url" class="large-text code" name="<?php echo esc_attr( NV_EVAL_OPT ); ?>[data_url]" value="<?php echo $f( 'data_url' ); // phpcs:ignore ?>"><p class="description">Fișierul actualizat zilnic de Novaria. Nu-l schimba decât dacă muți depozitul.</p></td></tr>
				<tr><th scope="row"><label for="nv-ch">Verifică datele la fiecare (ore)</label></th><td><input id="nv-ch" type="number" min="1" max="48" name="<?php echo esc_attr( NV_EVAL_OPT ); ?>[cache_hours]" value="<?php echo $f( 'cache_hours' ); // phpcs:ignore ?>"></td></tr>
			</table>
			<?php submit_button( 'Salvează' ); ?>
		</form>
	</div>
	<?php
}

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'nv_eval_action_links' );
function nv_eval_action_links( $l ) {
	array_unshift( $l, '<a href="' . esc_url( admin_url( 'options-general.php?page=nv-eval' ) ) . '">Setări</a>' );
	return $l;
}

/* ------------------------------------------------------------------ */
/* Păstrarea datelor (GDPR): ștergere automată + export/ștergere la cerere */
/* ------------------------------------------------------------------ */

register_activation_hook( __FILE__, 'nv_eval_activate' );
function nv_eval_activate() {
	nv_eval_register_cpt();
	if ( ! wp_next_scheduled( 'nv_eval_daily' ) ) {
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'nv_eval_daily' );
	}
	if ( false === get_option( NV_EVAL_OPT, false ) ) {
		add_option( NV_EVAL_OPT, nv_eval_defaults() );
	}
}
register_deactivation_hook( __FILE__, 'nv_eval_deactivate' );
function nv_eval_deactivate() {
	wp_clear_scheduled_hook( 'nv_eval_daily' );
}

add_action( 'nv_eval_daily', 'nv_eval_cleanup' );
function nv_eval_cleanup() {
	$m = (int) nv_eval_opts()['retention_m'];
	if ( $m <= 0 ) {
		return;
	}
	$old = get_posts(
		array(
			'post_type'      => 'nv_lead',
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

function nv_eval_leads_by_email( $email ) {
	return get_posts(
		array(
			'post_type'      => 'nv_lead',
			'post_status'    => 'any',
			'posts_per_page' => 100,
			'fields'         => 'ids',
			'meta_key'       => '_nv_email', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'     => $email, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
}

add_filter( 'wp_privacy_personal_data_exporters', 'nv_eval_reg_exporter' );
function nv_eval_reg_exporter( $ex ) {
	$ex['novaria-evaluator'] = array(
		'exporter_friendly_name' => 'Novaria Evaluator — cereri de evaluare',
		'callback'               => 'nv_eval_exporter',
	);
	return $ex;
}
function nv_eval_exporter( $email, $page = 1 ) {
	$items = array();
	foreach ( nv_eval_leads_by_email( $email ) as $id ) {
		$items[] = array(
			'group_id'    => 'nv-eval-leads',
			'group_label' => 'Cereri de evaluare',
			'item_id'     => 'nv-lead-' . $id,
			'data'        => array(
				array( 'name' => 'Data', 'value' => get_the_date( 'Y-m-d H:i', $id ) ),
				array( 'name' => 'Detalii', 'value' => implode( "\n", nv_eval_lead_lines( $id ) ) ),
			),
		);
	}
	return array( 'data' => $items, 'done' => true );
}
add_filter( 'wp_privacy_personal_data_erasers', 'nv_eval_reg_eraser' );
function nv_eval_reg_eraser( $er ) {
	$er['novaria-evaluator'] = array(
		'eraser_friendly_name' => 'Novaria Evaluator — cereri de evaluare',
		'callback'             => 'nv_eval_eraser',
	);
	return $er;
}
function nv_eval_eraser( $email, $page = 1 ) {
	$ids = nv_eval_leads_by_email( $email );
	foreach ( $ids as $id ) {
		wp_delete_post( $id, true );
	}
	return array( 'items_removed' => count( $ids ) > 0, 'items_retained' => false, 'messages' => array(), 'done' => true );
}
