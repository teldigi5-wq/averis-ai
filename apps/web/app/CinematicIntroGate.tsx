"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { supabase, supabaseConfigured } from "../lib/supabase";
import styles from "./cinematic-intro-v13.module.css";

const QA_FORCE = process.env.NEXT_PUBLIC_CINEMATIC_QA === "true";

export default function CinematicIntroGate() {
  const pathname = usePathname();
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(QA_FORCE);

  useEffect(() => {
    if (QA_FORCE) {
      setVisible(true);
      return;
    }
    if (!supabaseConfigured || !supabase) {
      setVisible(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setVisible(!data.session?.user);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setVisible(!session?.user);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!visible || pathname !== "/" || !rootRef.current) return;

    const root = rootRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    let cleanupMotion = () => {};
    let cleanupThree = () => {};

    if (!reducedMotion) {
      void (async () => {
        const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
          import("lenis"),
        ]);
        if (disposed) return;

        gsap.registerPlugin(ScrollTrigger);
        const lenis = new Lenis({
          smoothWheel: true,
          duration: 1.05,
          anchors: true,
          wheelMultiplier: 0.92,
        });
        const ticker = (time: number) => lenis.raf(time * 1000);
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add(ticker);
        gsap.ticker.lagSmoothing(0);

        const context = gsap.context(() => {
          gsap.from("[data-intro-line]", {
            yPercent: 112,
            opacity: 0,
            duration: 1.05,
            stagger: 0.11,
            ease: "power4.out",
          });
          gsap.from("[data-intro-support]", {
            y: 22,
            opacity: 0,
            duration: 0.8,
            stagger: 0.08,
            delay: 0.44,
            ease: "power3.out",
          });

          root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
            gsap.from(element, {
              y: 34,
              opacity: 0,
              duration: 0.8,
              ease: "power3.out",
              scrollTrigger: {
                trigger: element,
                start: "top 88%",
                once: true,
              },
            });
          });

          gsap.to("[data-orbit-one]", {
            rotate: 360,
            duration: 20,
            repeat: -1,
            ease: "none",
          });
          gsap.to("[data-orbit-two]", {
            rotate: -360,
            duration: 27,
            repeat: -1,
            ease: "none",
          });
        }, root);

        cleanupMotion = () => {
          context.revert();
          gsap.ticker.remove(ticker);
          lenis.destroy();
        };
      })();

      if (window.matchMedia("(min-width: 900px)").matches && canvasRef.current) {
        void (async () => {
          const THREE = await import("three");
          if (disposed || !canvasRef.current) return;

          const canvas = canvasRef.current;
          const host = canvas.parentElement;
          if (!host) return;

          let renderer;
          try {
            renderer = new THREE.WebGLRenderer({
              canvas,
              alpha: true,
              antialias: true,
              powerPreference: "high-performance",
            });
          } catch {
            return;
          }

          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
          camera.position.set(0, 0, 7.1);

          const group = new THREE.Group();
          scene.add(group);

          const geometry = new THREE.IcosahedronGeometry(1.65, 2);
          const material = new THREE.MeshStandardMaterial({
            color: 0x58d8cc,
            metalness: 0.28,
            roughness: 0.42,
            wireframe: true,
            transparent: true,
            opacity: 0.72,
          });
          const evidenceCore = new THREE.Mesh(geometry, material);
          group.add(evidenceCore);

          const innerGeometry = new THREE.IcosahedronGeometry(1.06, 1);
          const innerMaterial = new THREE.MeshBasicMaterial({
            color: 0x7baef4,
            transparent: true,
            opacity: 0.11,
          });
          const inner = new THREE.Mesh(innerGeometry, innerMaterial);
          group.add(inner);

          const orbitGeometry = new THREE.TorusGeometry(2.18, 0.012, 8, 128);
          const orbitMaterial = new THREE.MeshBasicMaterial({
            color: 0x86f0e5,
            transparent: true,
            opacity: 0.36,
          });
          const orbitA = new THREE.Mesh(orbitGeometry, orbitMaterial);
          orbitA.rotation.x = 1.12;
          orbitA.rotation.y = 0.28;
          group.add(orbitA);

          const orbitB = new THREE.Mesh(orbitGeometry, orbitMaterial.clone());
          orbitB.rotation.x = 0.38;
          orbitB.rotation.y = 1.08;
          orbitB.scale.setScalar(0.83);
          group.add(orbitB);

          const nodeGeometry = new THREE.SphereGeometry(0.055, 14, 14);
          const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0xc4fff8 });
          const nodes: InstanceType<typeof THREE.Mesh>[] = [];
          [
            [2.04, 0.45, 0.22],
            [-1.64, 1.18, -0.28],
            [0.42, -1.96, 0.36],
            [-0.48, 1.98, 0.54],
            [1.55, -1.17, -0.32],
          ].forEach(([x, y, z]) => {
            const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
            node.position.set(x, y, z);
            group.add(node);
            nodes.push(node);
          });

          scene.add(new THREE.AmbientLight(0xbce7ff, 1.45));
          const key = new THREE.DirectionalLight(0x9dfff4, 2.6);
          key.position.set(3.5, 4, 5);
          scene.add(key);
          const rim = new THREE.PointLight(0x6d8cff, 20, 12);
          rim.position.set(-3, -1.5, 4);
          scene.add(rim);

          const pointer = { x: 0, y: 0 };
          const onPointerMove = (event: PointerEvent) => {
            const rect = host.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 0.42;
            pointer.y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 0.28;
          };
          host.addEventListener("pointermove", onPointerMove, { passive: true });

          const resize = () => {
            const rect = host.getBoundingClientRect();
            const width = Math.max(1, rect.width);
            const height = Math.max(1, rect.height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
          };
          const observer = new ResizeObserver(resize);
          observer.observe(host);
          resize();

          const clock = new THREE.Clock();
          let frame = 0;
          const render = () => {
            frame = requestAnimationFrame(render);
            const elapsed = clock.getElapsedTime();
            group.rotation.y += (pointer.x - group.rotation.y) * 0.035;
            group.rotation.x += (-pointer.y - group.rotation.x) * 0.035;
            evidenceCore.rotation.y = elapsed * 0.14;
            evidenceCore.rotation.z = elapsed * 0.07;
            inner.rotation.x = -elapsed * 0.12;
            orbitA.rotation.z = elapsed * 0.09;
            orbitB.rotation.z = -elapsed * 0.075;
            nodes.forEach((node, index) => {
              node.scale.setScalar(0.84 + Math.sin(elapsed * 1.8 + index) * 0.14);
            });
            renderer.render(scene, camera);
          };
          render();

          cleanupThree = () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            host.removeEventListener("pointermove", onPointerMove);
            geometry.dispose();
            material.dispose();
            innerGeometry.dispose();
            innerMaterial.dispose();
            orbitGeometry.dispose();
            orbitMaterial.dispose();
            (orbitB.material as typeof orbitMaterial).dispose();
            nodeGeometry.dispose();
            nodeMaterial.dispose();
            renderer.dispose();
          };
        })();
      }
    }

    return () => {
      disposed = true;
      cleanupMotion();
      cleanupThree();
    };
  }, [pathname, visible]);

  if (!visible || pathname !== "/") return null;

  const openAccess = () => {
    const target = document.querySelector<HTMLElement>(".accountGrid");
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <section ref={rootRef} className={styles.intro} aria-label="Averis product introduction">
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.frame}>
        <div className={styles.introNav} data-intro-support>
          <a className={styles.lockup} href="#averis-intro" aria-label="Averis home">
            <span className={styles.lockupMark} aria-hidden="true" />
            <span><strong>Averis</strong><small>Evidence before submission</small></span>
          </a>
          <button type="button" className={styles.navAccess} onClick={openAccess}>Sign in</button>
        </div>

        <div id="averis-intro" className={styles.heroStage}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker} data-intro-support>ACADEMIC INTEGRITY · SOURCE INTELLIGENCE · REVISION EVIDENCE</p>
            <h1 aria-label="Know what needs attention before you submit">
              <span className={styles.lineMask}><span data-intro-line>Know what needs</span></span>
              <span className={styles.lineMask}><span data-intro-line>attention <em>before</em></span></span>
              <span className={styles.lineMask}><span data-intro-line>you submit.</span></span>
            </h1>
            <p className={styles.lede} data-intro-support>
              Averis turns similarity, source, citation and writing signals into reviewable evidence — so students can improve their work without black-box accusations.
            </p>
            <div className={styles.heroActions} data-intro-support>
              <button type="button" className={styles.primaryAction} onClick={openAccess}>Enter Averis <span>↗</span></button>
              <a className={styles.textAction} href="#evidence-journey">See the evidence flow <span>↓</span></a>
            </div>
            <div className={styles.trustRow} data-intro-support>
              <span><i /> Evidence, not verdicts</span>
              <span><i /> Original upload not retained</span>
              <span><i /> Student-controlled revision</span>
            </div>
          </div>

          <div className={styles.visualStage} aria-label="Interactive evidence network visualization">
            <canvas ref={canvasRef} className={styles.scene} aria-hidden="true" />
            <div className={styles.fallbackGlyph} aria-hidden="true" />
            <div className={`${styles.orbitLabel} ${styles.labelA}`} data-orbit-one><span>01</span> SOURCE</div>
            <div className={`${styles.orbitLabel} ${styles.labelB}`} data-orbit-two><span>02</span> CITATION</div>
            <div className={styles.signalCard}>
              <span>EVIDENCE TRACE</span>
              <strong>Passage → Source → Citation</strong>
              <small>Review context before deciding what to revise.</small>
            </div>
          </div>
        </div>

        <div id="evidence-journey" className={styles.journey}>
          <div className={styles.journeyLead} data-reveal>
            <p>THE AVERIS METHOD</p>
            <h2>Review first. Revise second.</h2>
            <span>Every improvement starts with visible evidence, not a hidden score.</span>
          </div>
          <div className={styles.storyGrid}>
            <article data-reveal>
              <span>01 / TRACE</span>
              <h3>See the matching passages.</h3>
              <p>Exact and fuzzy source evidence stays attached to the text that triggered it.</p>
              <div className={styles.miniEvidence}><i /><b>“Evidence should remain reviewable…”</b><small>87 · passage match</small></div>
            </article>
            <article data-reveal>
              <span>02 / VERIFY</span>
              <h3>Connect claims to real sources.</h3>
              <p>Crossref metadata, DOI checks and citation linkage help distinguish overlap from responsible attribution.</p>
              <div className={styles.nodeRail}><i /><i /><i /><span>draft</span><span>source</span><span>reference</span></div>
            </article>
            <article data-reveal>
              <span>03 / REVISE</span>
              <h3>Improve with context intact.</h3>
              <p>The Revision Coach flags weak paraphrasing, repetitive prose and citation gaps before suggesting user-controlled improvements.</p>
              <div className={styles.diffPreview}><del>Generic copied phrasing</del><ins>Clearer attributed revision</ins></div>
            </article>
          </div>
        </div>

        <div className={styles.boundary} data-reveal>
          <div>
            <span>HUMAN REVIEW REMAINS THE DECISION LAYER</span>
            <h2>Averis explains evidence. It does not accuse.</h2>
          </div>
          <button type="button" onClick={openAccess}>Start with the free beta</button>
        </div>
      </div>
    </section>
  );
}
