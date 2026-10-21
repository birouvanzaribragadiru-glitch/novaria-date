<?php
/**
 * Urmărirea după evaluare: la 30, 60 și 90 de zile după o cerere cu email, vizitatorul primește „ce s-a schimbat în zona ta”
 * (prețul median acum față de atunci, anunțuri noi, estimarea actualizată) și o invitație la evaluarea completă.
 * Doar pentru cei care au lăsat emailul și acordul; fiecare mesaj are link de dezabonare.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'NOVARIA_EV_URM_ZILE', '30,60,90' );

/** La crearea unui lead: reținem mediana zonei de atunci și programăm mesajele. */
function novaria_ev_urmarire_programeaza( $post_id ) {
	$o  = novaria_ev_opts();
	$em = get_post_meta( $post_id, '_novaria_email', true );
	if ( empty( $o['urmarire'] ) || ! $em || ! is_email( $em ) ) {
		return;
	}
	$ref = novaria_ev_urmarire_zona( $post_id );
	if ( $ref && isset( $ref['med'] ) ) {
		update_post_meta( $post_id, '_novaria_zona_med0', (int) $ref['med'] );
	}
	foreach ( explode( ',', NOVARIA_EV_URM_ZILE ) as $zile ) {
		$zile = (int) $zile;
		// la o oră potrivită (09:30 ora site-ului), nu la miezul nopții
		$t = strtotime( '+' . $zile . ' days 09:30', current_time( 'timestamp' ) ) - ( (int) get_option( 'gmt_offset' ) * HOUR_IN_SECONDS );
		wp_schedule_single_event( $t, 'novaria_ev_urmarire', array( (int) $post_id, $zile ) );
	}
}

/** Zona lead-ului în datele actuale (id-ul din proprietate sau numele). */
function novaria_ev_urmarire_zona( $post_id ) {
	$d = novaria_ev_get_data();
	$s = (array) get_post_meta( $post_id, '_novaria_prop', true );
	$z = null;
	if ( ! empty( $s['zona'] ) ) {
		$z = novaria_ev_raport_zone( $d, $s['zona'] );
	}
	if ( ! $z ) {
		$zn = get_post_meta( $post_id, '_novaria_zona', true );
		if ( $zn ) {
			$z = novaria_ev_raport_zone( $d, $zn );
		}
	}
	if ( ! $z ) {
		return null;
	}
	$tip = get_post_meta( $post_id, '_novaria_tip', true );
	$tip = in_array( $tip, array( 'apartament', 'casa' ), true ) ? $tip : 'apartament';
	$st  = isset( $z['st'][ $tip ] ) ? $z['st'][ $tip ] : array();
	$din = isset( $z['din'][ $tip ] ) ? $z['din'][ $tip ] : array();
	return array( 'id' => $z['id'], 'nume' => $z['nume'], 'tip' => $tip, 'med' => isset( $din['med'] ) ? $din['med'] : ( isset( $st['med'] ) ? $st['med'] : null ), 'noi' => isset( $din['noi'] ) ? $din['noi'] : ( isset( $din['capNoi'] ) ? $din['capNoi'] : null ), 'ret' => isset( $din['ret'] ) ? $din['ret'] : null, 'prop' => isset( $din['prop'] ) ? $din['prop'] : null, 't4' => isset( $din['t4'] ) ? $din['t4'] : null );
}

function novaria_ev_unsub_token( $email ) {
	return substr( hash_hmac( 'sha256', strtolower( trim( $email ) ), wp_salt( 'auth' ) ), 0, 24 );
}

function novaria_ev_unsub_url( $email ) {
	return add_query_arg( array( 'novaria_ev_unsub' => novaria_ev_unsub_token( $email ), 'e' => rawurlencode( $email ) ), home_url( '/' ) );
}

add_action( 'novaria_ev_urmarire', 'novaria_ev_urmarire_trimite', 10, 2 );
function novaria_ev_urmarire_trimite( $post_id, $zile ) {
	$o = novaria_ev_opts();
	if ( empty( $o['urmarire'] ) ) {
		return;
	}
	$post = get_post( $post_id );
	if ( ! $post || 'novaria_lead' !== $post->post_type ) {
		return;
	}
	$em = get_post_meta( $post_id, '_novaria_email', true );
	if ( ! $em || ! is_email( $em ) || get_post_meta( $post_id, '_novaria_unsub', true ) || get_option( 'novaria_ev_unsub_' . md5( strtolower( $em ) ) ) ) {
		return;
	}
	// dacă între timp a devenit client (lead marcat preluat) sau a trimis o cerere mai nouă, nu-l mai batem la cap
	if ( get_post_meta( $post_id, '_novaria_stop', true ) ) {
		return;
	}
	$mai_nou = get_posts( array( 'post_type' => 'novaria_lead', 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'date_query' => array( array( 'after' => $post->post_date ) ), 'meta_key' => '_novaria_email', 'meta_value' => $em ) );
	if ( $mai_nou ) {
		return;
	}
	$ref  = novaria_ev_urmarire_zona( $post_id );
	$est  = (array) get_post_meta( $post_id, '_novaria_est', true );
	$nm   = get_post_meta( $post_id, '_novaria_nume', true );
	$med0 = (int) get_post_meta( $post_id, '_novaria_zona_med0', true );
	$ttl  = preg_replace( '/\s+—\s+.*$/u', '', get_post_field( 'post_title', $post_id ) );
	$L    = array();
	$L[]  = 'Bună' . ( $nm ? ', ' . $nm : '' ) . ',';
	$L[]  = '';
	$L[]  = 'Acum ' . $zile . ' de zile ai evaluat pe novaria.ro: ' . $ttl . ( isset( $est['realist'] ) ? ' (estimare realistă atunci: ' . novaria_ev_fmt_eur( $est['realist'] ) . ')' : '' ) . '. Iată ce s-a schimbat între timp' . ( $ref ? ' în ' . $ref['nume'] : '' ) . ':';
	$L[]  = '';
	if ( $ref && $ref['med'] ) {
		$delta = $med0 ? ( $ref['med'] / $med0 - 1 ) * 100 : null;
		$L[] = '• Prețul median cerut: ' . novaria_ev_fmt_n( $ref['med'] ) . ' €/mp' . ( null !== $delta && abs( $delta ) >= 0.5 ? ' (' . novaria_ev_fmt_pct( $delta ) . ' față de când ai evaluat)' : ( $med0 ? ' (neschimbat față de când ai evaluat)' : '' ) );
		if ( null !== $delta && abs( $delta ) >= 0.5 && isset( $est['realist'] ) ) {
			$L[] = '• Estimarea actualizată pentru proprietatea ta: aproximativ ' . novaria_ev_fmt_eur( round( $est['realist'] * ( 1 + $delta / 100 ) / 500 ) * 500 );
		}
		if ( null !== $ref['noi'] ) {
			$L[] = '• Anunțuri noi în ultimele 4 săptămâni: ' . novaria_ev_fmt_n( $ref['noi'] ) . ( null !== $ref['ret'] ? ' · ieșite din piață: ' . novaria_ev_fmt_n( $ref['ret'] ) : '' );
		}
		if ( null !== $ref['prop'] ) {
			$L[] = '• ' . $ref['prop'] . '% din oferte sunt direct de la proprietari.';
		}
	} else {
		$L[] = '• Nu avem încă destule anunțuri noi în zona ta pentru o comparație corectă; revenim cu cifrele luna viitoare.';
	}
	$L[] = '';
	$L[] = 90 === (int) $zile
		? 'Dacă vânzarea e încă în plan, cel mai bun moment pentru o evaluare completă e înainte de a publica anunțul: prețul de pornire decide cât de repede se vinde. Îți fac evaluarea gratuit, pe proprietăți comparabile actuale — răspunde la acest email sau sună-mă.'
		: 'Dacă te gândești să vinzi în următoarele luni, îți fac gratuit o evaluare completă, pe proprietăți comparabile actuale, și îți spun sincer la ce preț se vinde în 1–3 luni. Răspunde la acest email sau sună-mă.';
	$L[] = '';
	$L[] = 'Lucian Antohe · Novaria · ' . $o['phone'] . ( $o['whatsapp'] ? ' · WhatsApp: https://wa.me/' . $o['whatsapp'] : '' );
	$L[] = '';
	$L[] = 'Primești acest mesaj pentru că ai cerut o evaluare pe novaria.ro și ai acceptat să fii contactat. Nu mai vrei: ' . novaria_ev_unsub_url( $em );
	$reply   = is_email( $o['email'] ) ? $o['email'] : get_option( 'admin_email' );
	$headers = array( 'Content-Type: text/plain; charset=UTF-8', 'Reply-To: ' . $reply, 'List-Unsubscribe: <' . novaria_ev_unsub_url( $em ) . '>' );
	$subj    = $ref && $ref['med'] ? 'Ce s-a schimbat în ' . $ref['nume'] . ' de când ai evaluat' : 'Piața din zona ta, la ' . $zile . ' de zile de la evaluare';
	if ( wp_mail( $em, $subj, implode( "\n", $L ), $headers ) ) {
		update_post_meta( $post_id, '_novaria_urmarire_' . $zile, current_time( 'mysql' ) );
	}
}

/* ---------- dezabonare: linkul din email ---------- */
add_action( 'init', 'novaria_ev_unsub_init' );
function novaria_ev_unsub_init() {
	if ( empty( $_GET['novaria_ev_unsub'] ) || empty( $_GET['e'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return;
	}
	$em  = sanitize_email( rawurldecode( (string) $_GET['e'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$tok = preg_replace( '/[^a-f0-9]/', '', (string) $_GET['novaria_ev_unsub'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( ! $em || ! hash_equals( novaria_ev_unsub_token( $em ), $tok ) ) {
		wp_die( 'Linkul de dezabonare nu e valid.', 'Novaria', array( 'response' => 400 ) );
	}
	update_option( 'novaria_ev_unsub_' . md5( strtolower( $em ) ), current_time( 'mysql' ), false );
	foreach ( novaria_ev_leads_by_email( $em ) as $p ) {
		update_post_meta( $p->ID, '_novaria_unsub', 1 );
	}
	wp_die( '<p style="font-family:sans-serif;font-size:16px">Gata: nu mai primești mesaje de la Novaria despre evaluarea ta. Dacă vrei totuși o evaluare completă, ne poți scrie oricând.</p>', 'Dezabonat', array( 'response' => 200 ) );
}

/* ---------- în lista de lead-uri: ce mesaje au plecat ---------- */
add_filter( 'manage_novaria_lead_posts_columns', 'novaria_ev_urm_col_add' );
function novaria_ev_urm_col_add( $c ) {
	$c['novaria_urm'] = 'Urmărire';
	return $c;
}
add_action( 'manage_novaria_lead_posts_custom_column', 'novaria_ev_urm_col', 10, 2 );
function novaria_ev_urm_col( $col, $post_id ) {
	if ( 'novaria_urm' !== $col ) {
		return;
	}
	if ( get_post_meta( $post_id, '_novaria_unsub', true ) ) {
		echo '<span style="opacity:.6">dezabonat</span>';
		return;
	}
	if ( ! get_post_meta( $post_id, '_novaria_email', true ) ) {
		echo '<span style="opacity:.6">fără email</span>';
		return;
	}
	$out = array();
	foreach ( explode( ',', NOVARIA_EV_URM_ZILE ) as $z ) {
		$out[] = get_post_meta( $post_id, '_novaria_urmarire_' . (int) $z, true ) ? '<b>' . (int) $z . '</b>' : '<span style="opacity:.45">' . (int) $z . '</span>';
	}
	echo wp_kses( implode( ' · ', $out ), array( 'b' => array(), 'span' => array( 'style' => array() ) ) );
}
