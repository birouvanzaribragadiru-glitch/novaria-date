<?php
/**
 * Raportul lunar de piață pe zonă: shortcode [novaria_raport zona="bragadiru"] + articol lunar creat automat (ciornă).
 * Folosește doar cifrele agregate din data/evaluator.json (câmpul „din” al fiecărei zone): niciun anunț, niciun nume.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_shortcode( 'novaria_raport', 'novaria_ev_raport_shortcode' );

function novaria_ev_raport_zone( $d, $id ) {
	if ( ! is_array( $d ) || empty( $d['zone'] ) ) {
		return null;
	}
	$id = sanitize_title( $id );
	foreach ( $d['zone'] as $z ) {
		if ( isset( $z['id'] ) && $z['id'] === $id ) {
			return $z;
		}
	}
	foreach ( $d['zone'] as $z ) {
		if ( isset( $z['nume'] ) && sanitize_title( $z['nume'] ) === $id ) {
			return $z;
		}
	}
	return null;
}

function novaria_ev_fmt_n( $v ) {
	return number_format( (float) $v, 0, ',', '.' );
}

function novaria_ev_fmt_pct( $v, $dec = 1 ) {
	$v = (float) $v;
	$s = number_format( abs( $v ), $dec, ',', '.' );
	return ( $v > 0.049 ? '+' : ( $v < -0.049 ? '−' : '' ) ) . $s . '%';
}

/** Textul raportului pentru un tip (apartamente / case): cifre + frazele care le explică. */
function novaria_ev_raport_bloc( $z, $tip, $d ) {
	$st  = isset( $z['st'][ $tip ] ) ? $z['st'][ $tip ] : null;
	$din = isset( $z['din'][ $tip ] ) ? $z['din'][ $tip ] : array();
	if ( ! $st && ! $din ) {
		return '';
	}
	$nume = $z['nume'];
	$lbl  = 'apartament' === $tip ? 'Apartamente' : 'Case';
	$unu  = 'apartament' === $tip ? 'un apartament' : 'o casă';
	$med  = isset( $din['med'] ) ? $din['med'] : ( $st && isset( $st['med'] ) ? $st['med'] : null );
	$n    = $st && isset( $st['n'] ) ? $st['n'] : ( isset( $din['n'] ) ? $din['n'] : null );
	$k    = array();
	if ( $med ) {
		$k[] = array( 'Preț median cerut', novaria_ev_fmt_n( $med ) . ' €/mp', $st && isset( $st['p25'], $st['p75'] ) ? 'jumătatea din mijloc a pieței: ' . novaria_ev_fmt_n( $st['p25'] ) . '–' . novaria_ev_fmt_n( $st['p75'] ) . ' €/mp' : '' );
	}
	if ( isset( $din['t4'] ) ) {
		$k[] = array( 'Față de acum 4 săptămâni', novaria_ev_fmt_pct( $din['t4'] ), 'prețul median cerut' );
	}
	if ( $n ) {
		$k[] = array( 'Anunțuri analizate', novaria_ev_fmt_n( $n ), 'în ultimele luni' );
	}
	$noi = isset( $din['noi'] ) ? $din['noi'] : ( isset( $din['capNoi'] ) ? $din['capNoi'] : null );
	if ( null !== $noi ) {
		$k[] = array( 'Anunțuri noi', novaria_ev_fmt_n( $noi ), 'în ultimele 4 săptămâni' );
	}
	if ( isset( $din['ret'] ) ) {
		$k[] = array( 'Ieșite din piață', novaria_ev_fmt_n( $din['ret'] ), 'vândute sau retrase, în 4 săptămâni' );
	}
	$red = isset( $din['red'] ) && $din['red'] > 0 ? $din['red'] : ( isset( $din['capRed'] ) && $din['capRed'] > 0 ? $din['capRed'] : null );
	if ( null !== $red ) {
		$k[] = array( 'Cu prețul redus', $red . '%', 'din anunțurile active' );
	}
	$prop = isset( $din['prop'] ) ? $din['prop'] : null;
	if ( null !== $prop ) {
		$k[] = array( 'De la proprietari direct', $prop . '%', 'restul sunt agenții și dezvoltatori' );
	}
	if ( isset( $din['zile'] ) && $din['zile'] > 0 ) {
		$k[] = array( 'Vechimea ofertei', $din['zile'] . ' zile', 'mediană, de când sunt publicate anunțurile' );
	}
	$ch = isset( $z['ch'][ $tip ] ) ? $z['ch'][ $tip ] : null;
	if ( $ch && ! empty( $ch['med'] ) ) {
		$k[] = array( 'Chiria mediană', str_replace( '.', ',', (string) $ch['med'] ) . ' €/mp/lună', 'din ' . (int) $ch['n'] . ' anunțuri de închiriere' );
		if ( ! empty( $ch['rand'] ) ) {
			$k[] = array( 'Randament brut', str_replace( '.', ',', (string) $ch['rand'] ) . '%', 'chiria pe un an față de prețul cerut la vânzare' );
		}
	}
	if ( ! $k ) {
		return '';
	}
	// frazele
	$p = array();
	if ( $med ) {
		$p[] = 'În ' . $nume . ', ' . $unu . ' se listează acum la o mediană de <b>' . novaria_ev_fmt_n( $med ) . ' €/mp</b>' . ( $st && isset( $st['p25'], $st['p75'] ) ? ', iar jumătatea din mijloc a pieței cere între ' . novaria_ev_fmt_n( $st['p25'] ) . ' și ' . novaria_ev_fmt_n( $st['p75'] ) . ' €/mp' : '' ) . '.';
	}
	if ( isset( $din['t4'] ) ) {
		$t = (float) $din['t4'];
		$p[] = abs( $t ) < 0.5 ? 'Față de acum patru săptămâni, prețurile cerute au stat pe loc.' : ( 'Față de acum patru săptămâni, prețurile cerute au ' . ( $t > 0 ? 'urcat' : 'scăzut' ) . ' cu ' . novaria_ev_fmt_pct( abs( $t ) ) . '.' );
	}
	if ( null !== $noi && isset( $din['ret'] ) ) {
		$p[] = 'Au apărut ' . novaria_ev_fmt_n( $noi ) . ' anunțuri noi și au ieșit din piață ' . novaria_ev_fmt_n( $din['ret'] ) . ( $noi > $din['ret'] * 1.3 ? ': oferta crește mai repede decât se vinde, deci cumpărătorii au de unde alege și negociază.' : ( $din['ret'] > $noi * 1.3 ? ': se vinde mai repede decât apar oferte noi, un semn bun pentru vânzători.' : ': oferta și vânzările merg cap la cap.' ) );
	} elseif ( null !== $noi ) {
		$p[] = 'Au apărut ' . novaria_ev_fmt_n( $noi ) . ' anunțuri noi în ultimele patru săptămâni.';
	}
	if ( null !== $red ) {
		$p[] = $red . '% din anunțuri și-au redus prețul de la publicare' . ( $red >= 20 ? ' — un semn că multe au pornit prea sus.' : '.' );
	}
	if ( null !== $prop ) {
		$p[] = $prop . '% din oferte sunt publicate direct de proprietari.';
	}
	if ( $ch && ! empty( $ch['rand'] ) ) {
		$p[] = 'Pentru investitori: chiria mediană e ' . str_replace( '.', ',', (string) $ch['med'] ) . ' €/mp pe lună, adică un randament brut de ' . str_replace( '.', ',', (string) $ch['rand'] ) . '% pe an la prețurile cerute acum.';
	}
	$h  = '<div class="nvrp-bloc"><h3 class="nvrp-h3">' . esc_html( $lbl ) . '</h3><div class="nvrp-kpi">';
	foreach ( $k as $x ) {
		$h .= '<div class="nvrp-k"><span class="nvrp-kv">' . esc_html( $x[1] ) . '</span><span class="nvrp-kl">' . esc_html( $x[0] ) . '</span>' . ( $x[2] ? '<span class="nvrp-ks">' . esc_html( $x[2] ) . '</span>' : '' ) . '</div>';
	}
	$h .= '</div><p class="nvrp-p">' . wp_kses( implode( ' ', $p ), array( 'b' => array() ) ) . '</p></div>';
	return $h;
}

function novaria_ev_raport_shortcode( $atts ) {
	$a = shortcode_atts( array( 'zona' => '', 'tip' => '', 'titlu' => '1', 'cta' => '1' ), $atts, 'novaria_raport' );
	$d = novaria_ev_get_data();
	$z = novaria_ev_raport_zone( $d, $a['zona'] );
	if ( ! $z ) {
		return current_user_can( 'edit_posts' ) ? '<p><em>[novaria_raport] Zona „' . esc_html( $a['zona'] ) . '” nu există în date. Folosește id-ul zonei (ex. bragadiru, drumul-taberei, popesti-leordeni).</em></p>' : '';
	}
	$o     = novaria_ev_opts();
	$luna  = wp_date( 'F Y', ! empty( $d['actualizat'] ) ? strtotime( $d['actualizat'] ) : time() );
	$tipuri = $a['tip'] ? array( $a['tip'] ) : array( 'apartament', 'casa' );
	$body  = '';
	foreach ( $tipuri as $t ) {
		$body .= novaria_ev_raport_bloc( $z, $t, $d );
	}
	if ( ! $body ) {
		return current_user_can( 'edit_posts' ) ? '<p><em>[novaria_raport] Prea puține anunțuri în ' . esc_html( $z['nume'] ) . ' pentru un raport.</em></p>' : '';
	}
	$h = '<section class="nvrp">';
	if ( '0' !== $a['titlu'] ) {
		$h .= '<h2 class="nvrp-h2">Piața imobiliară în ' . esc_html( $z['nume'] ) . ' — ' . esc_html( $luna ) . '</h2>';
	}
	$h .= $body;
	$cta = ! empty( $o['raport_cta_url'] ) ? $o['raport_cta_url'] : '';
	if ( '0' !== $a['cta'] && $cta ) {
		$h .= '<p class="nvrp-cta"><a class="nvrp-btn" href="' . esc_url( $cta ) . '">Află cât valorează proprietatea ta în ' . esc_html( $z['nume'] ) . ' →</a><span>Evaluare gratuită, în 1 minut, pe anunțurile actuale din zonă.</span></p>';
	}
	$h .= '<p class="nvrp-src">Sursa: monitorizarea Novaria a anunțurilor publice din ' . esc_html( $z['nume'] ) . ( ! empty( $d['anunturi'] ) ? ' (din ' . esc_html( novaria_ev_fmt_n( $d['anunturi'] ) ) . ' anunțuri analizate în București și Ilfov)' : '' ) . ', actualizată ' . esc_html( wp_date( 'j F Y', ! empty( $d['actualizat'] ) ? strtotime( $d['actualizat'] ) : time() ) ) . '. Prețurile sunt prețuri cerute în anunțuri, nu prețuri de tranzacționare.</p>';
	$h .= '</section>';
	$h .= '<style>.nvrp{margin:1.5em 0;font-family:inherit}.nvrp-h2{margin:0 0 .6em}.nvrp-h3{margin:1.2em 0 .5em;font-size:1.15em}.nvrp-kpi{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}.nvrp-k{border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}.nvrp-kv{font-size:1.4em;font-weight:700;line-height:1.1}.nvrp-kl{font-size:.9em;font-weight:600}.nvrp-ks{font-size:.8em;opacity:.7}.nvrp-p{margin:.9em 0 0;line-height:1.55}.nvrp-cta{margin:1.4em 0 0;display:flex;flex-direction:column;gap:6px}.nvrp-btn{display:inline-block;background:' . esc_attr( novaria_ev_hex( $o['color_main'], '#13233F' ) ) . ';color:#fff!important;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;width:fit-content}.nvrp-cta span{font-size:.9em;opacity:.75}.nvrp-src{font-size:.8em;opacity:.65;margin-top:1.2em}</style>';
	return $h;
}

/* ---------- articolul lunar (ciornă, sau publicat automat dacă e bifat în setări) ---------- */

add_action( 'novaria_ev_daily', 'novaria_ev_raport_lunar' );
function novaria_ev_raport_lunar() {
	$o = novaria_ev_opts();
	if ( empty( $o['raport_zone'] ) ) {
		return;
	}
	$luna = wp_date( 'Y-m' );
	if ( get_option( 'novaria_ev_raport_luna' ) === $luna ) {
		return;
	}
	$d = novaria_ev_get_data();
	if ( ! novaria_ev_valid_data( $d ) ) {
		return;
	}
	$cat = get_term_by( 'slug', 'piata-imobiliara', 'category' );
	if ( ! $cat ) {
		$ins = wp_insert_term( 'Piața imobiliară', 'category', array( 'slug' => 'piata-imobiliara' ) );
		$cat_id = is_wp_error( $ins ) ? 0 : (int) $ins['term_id'];
	} else {
		$cat_id = (int) $cat->term_id;
	}
	$facute = 0;
	foreach ( array_filter( array_map( 'trim', explode( ',', (string) $o['raport_zone'] ) ) ) as $zid ) {
		$z = novaria_ev_raport_zone( $d, $zid );
		if ( ! $z || empty( $z['din'] ) ) {
			continue;
		}
		$titlu = 'Piața imobiliară în ' . $z['nume'] . ': ' . wp_date( 'F Y' );
		$exista = get_posts( array( 'post_type' => 'post', 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => '_novaria_raport', 'meta_value' => $z['id'] . '|' . $luna ) );
		if ( $exista ) {
			continue;
		}
		$intro = '<p>Ce se întâmplă cu prețurile în ' . esc_html( $z['nume'] ) . ', câte proprietăți se scot la vânzare și cât de repede se vând — cifrele lunii, din monitorizarea Novaria a anunțurilor publice din zonă. Raportul se actualizează automat pe măsură ce vin date noi.</p>';
		$content = $intro . "\n\n" . '[novaria_raport zona="' . esc_attr( $z['id'] ) . '" titlu="0"]';
		$pid = wp_insert_post(
			array(
				'post_type'     => 'post',
				'post_status'   => ! empty( $o['raport_auto'] ) ? 'publish' : 'draft',
				'post_title'    => $titlu,
				'post_content'  => $content,
				'post_category' => $cat_id ? array( $cat_id ) : array(),
			),
			true
		);
		if ( ! is_wp_error( $pid ) ) {
			update_post_meta( $pid, '_novaria_raport', $z['id'] . '|' . $luna );
			$facute++;
		}
	}
	update_option( 'novaria_ev_raport_luna', $luna, false );
	if ( $facute ) {
		$to = is_email( $o['email'] ) ? $o['email'] : get_option( 'admin_email' );
		novaria_ev_mail( $to, 'Novaria: ' . $facute . ' rapoarte de piață pentru ' . wp_date( 'F Y' ) . ( empty( $o['raport_auto'] ) ? ' (ciorne, de publicat)' : ' (publicate)' ), ( empty( $o['raport_auto'] ) ? "Rapoartele lunare de piață sunt gata ca ciorne. Citește-le și publică-le:\n" : "Rapoartele lunare de piață au fost publicate:\n" ) . admin_url( 'edit.php?category_name=piata-imobiliara' ) );
	}
}
