"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { supabase, supabaseConfigured } from "../lib/supabase";
import styles from "./cinematic-intro-v13.module.css";

const QA_FORCE = process.env.NEXT_PUBLIC_CINEMATIC_QA === "true";

const workflow = [
  {
    index: "01",
    title: "Similarity evidence",
    copy: "Inspect exact and fuzzy overlap at passage level instead of treating one percentage as a verdict.",
    icon: "compare",
  },
  {
    index: "02",
    title: "Source trace",
    copy: "Keep matched wording connected to source context, DOI metadata and evidence provenance.",
    icon: "source",
  },
  {
    index: "03",
    title: "Citation checks",
    copy: "Review citation proximity, bibliography linkage and reference metadata before submission.",
    icon: "citation",
  },
  {
    index: "04",
    title: "Writing refinement",
    copy: "Improve clarity, structure and academic tone while keeping meaning, citations and source context intact.",
    icon: "revision",
  },
  {
    index: "05",
    title: "Privacy controls",
    copy: "Use an evidence workflow designed around bounded retention and explicit human review.",
    icon: "privacy",
  },
] as const;

function FeatureIcon({ name }: { name: (typeof workflow)[number]["icon"] }) {
  if (name === "compare") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h11M4 9h8M4 13h6M15 13l5 5m0-5-5 5" /></svg>;
  }
  if (name === "source") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4M4 15l8 4 8-4" /></svg>;
  }
  if (name === "citation") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8H4v4h3v5H3v-6c0-3 1-5 4-6v3Zm11 0h-3v4h3v5h-4v-6c0-3 1-5 4-6v3Z" /></svg>;
  }
  if (name === "revision") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L20 8l-4-4L4 16Z" /><path d="m13 7 4 4" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 7.4 7 9 4.1-1.6 7-4.4 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
}

export default function CinematicIntroGate() {
  const pathname = usePathname();
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(QA_FORCE);
  const [menuOpen, setMenuOpen] = useState(false);

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
          duration: 1.02,
          anchors: true,
          wheelMultiplier: 0.9,
        });
        const ticker = (time: number) => lenis.raf(time * 1000);
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add(ticker);
        gsap.ticker.lagSmoothing(0);

        const context = gsap.context(() => {
          gsap.from("[data-hero-line]", {
            yPercent: 118,
            opacity: 0,
            duration: 0.95,
            stagger: 0.095,
            ease: "power4.out",
          });
          gsap.from("[data-hero-support]", {
            y: 20,
            opacity: 0,
            duration: 0.72,
            stagger: 0.07,
            delay: 0.35,
            ease: "power3.out",
          });
          gsap.from("[data-product-frame]", {
            y: 30,
            rotateX: 4,
            opacity: 0,
            duration: 1.1,
            delay: 0.24,
            ease: "power3.out",
          });

          root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
            gsap.from(element, {
              y: 28,
              opacity: 0,
              duration: 0.76,
              ease: "power3.out",
              scrollTrigger: {
                trigger: element,
                start: "top 90%",
                once: true,
              },
            });
          });

          gsap.to("[data-scan-line]", {
            xPercent: 210,
            duration: 4.4,
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

          let renderer: InstanceType<typeof THREE.WebGLRenderer>;
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
          const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
          camera.position.set(0, 0.35, 6.4);

          const field = new THREE.Group();
          field.rotation.x = -0.56;
          field.rotation.z = -0.12;
          field.position.set(0.4, -0.6, -1.2);
          scene.add(field);

          const planeGeometry = new THREE.PlaneGeometry(9.2, 6.4, 24, 16);
          const position = planeGeometry.attributes.position;
          for (let index = 0; index < position.count; index += 1) {
            const x = position.getX(index);
            const y = position.getY(index);
            position.setZ(index, Math.sin(x * 0.75) * 0.17 + Math.cos(y * 1.15) * 0.1);
          }
          const planeMaterial = new THREE.MeshBasicMaterial({
            color: 0x188dff,
            wireframe: true,
            transparent: true,
            opacity: 0.105,
          });
          const plane = new THREE.Mesh(planeGeometry, planeMaterial);
          field.add(plane);

          const pointCount = 100;
          const pointData = new Float32Array(pointCount * 3);
          for (let index = 0; index < pointCount; index += 1) {
            const i = index * 3;
            const angle = index * 2.399963;
            const radius = 0.8 + (index % 17) * 0.15;
            pointData[i] = Math.cos(angle) * radius;
            pointData[i + 1] = Math.sin(angle) * radius * 0.62;
            pointData[i + 2] = ((index % 9) - 4) * 0.08;
          }
          const pointGeometry = new THREE.BufferGeometry();
          pointGeometry.setAttribute("position", new THREE.BufferAttribute(pointData, 3));
          const pointMaterial = new THREE.PointsMaterial({
            color: 0x68efff,
            size: 0.035,
            transparent: true,
            opacity: 0.58,
            sizeAttenuation: true,
          });
          const points = new THREE.Points(pointGeometry, pointMaterial);
          scene.add(points);

          const pointer = { x: 0, y: 0 };
          const onPointerMove = (event: PointerEvent) => {
            const rect = host.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 0.12;
            pointer.y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 0.08;
          };
          host.addEventListener("pointermove", onPointerMove, { passive: true });

          const resize = () => {
            const rect = host.getBoundingClientRect();
            const width = Math.max(1, rect.width);
            const height = Math.max(1, rect.height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
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
            field.rotation.z = -0.12 + Math.sin(elapsed * 0.12) * 0.015 + pointer.x;
            field.rotation.x = -0.56 + pointer.y;
            points.rotation.z = elapsed * 0.015;
            points.rotation.y = elapsed * 0.025;
            renderer.render(scene, camera);
          };
          render();

          cleanupThree = () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            host.removeEventListener("pointermove", onPointerMove);
            planeGeometry.dispose();
            planeMaterial.dispose();
            pointGeometry.dispose();
            pointMaterial.dispose();
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

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  if (!visible || pathname !== "/") return null;

  const openAccess = () => {
    setMenuOpen(false);
    const target = document.querySelector<HTMLElement>(".accountGrid");
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  };

  const scrollTo = (selector: string) => {
    setMenuOpen(false);
    document.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section ref={rootRef} className={styles.intro} aria-label="Averis product introduction">
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.frame}>
        <header className={styles.introNav} data-hero-support>
          <button type="button" className={styles.brandHome} onClick={() => scrollTo("#averis-intro")} aria-label="Averis home">
            <span className={styles.brandLockup} aria-hidden="true" />
          </button>

          <nav className={styles.desktopNav} aria-label="Product navigation">
            <button type="button" onClick={() => scrollTo("#platform")}>Product</button>
            <button type="button" onClick={() => scrollTo("#workflow")}>Evidence</button>
            <button type="button" onClick={() => scrollTo("#revision-safety")}>Revision</button>
            <button type="button" onClick={() => scrollTo("#trust-boundary")}>Privacy</button>
          </nav>

          <div className={styles.navActions}>
            <button type="button" className={styles.signIn} onClick={openAccess}>Sign in</button>
            <button type="button" className={styles.startButton} onClick={openAccess}>Start free <span>→</span></button>
            <button
              type="button"
              className={styles.menuButton}
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span /><span /><span />
            </button>
          </div>

          {menuOpen ? (
            <div className={styles.mobileMenu}>
              <button type="button" onClick={() => scrollTo("#platform")}>Product</button>
              <button type="button" onClick={() => scrollTo("#workflow")}>Evidence workflow</button>
              <button type="button" onClick={() => scrollTo("#revision-safety")}>Writing refinement</button>
              <button type="button" onClick={() => scrollTo("#trust-boundary")}>Privacy & trust</button>
              <button type="button" className={styles.mobilePrimary} onClick={openAccess}>Open Averis</button>
            </div>
          ) : null}
        </header>

        <div id="averis-intro" className={styles.heroStage}>
          <div className={styles.heroCopy}>
            <div className={styles.kicker} data-hero-support>
              <span className={styles.kickerIcon}>A</span>
              BUILT FOR EVIDENCE-FIRST ACADEMIC REVIEW
            </div>
            <h1 aria-label="Academic review with evidence. Writing integrity with confidence.">
              <span className={styles.lineMask}><span data-hero-line>Academic review</span></span>
              <span className={styles.lineMask}><span data-hero-line>with <em>evidence.</em></span></span>
              <span className={styles.lineMask}><span data-hero-line>Writing integrity</span></span>
              <span className={styles.lineMask}><span data-hero-line>with <em>confidence.</em></span></span>
            </h1>
            <p className={styles.lede} data-hero-support>
              Averis connects similarity evidence, scholarly sources, citation context and guided revision in one professional workspace — with human review kept at the center of every decision.
            </p>
            <div className={styles.heroActions} data-hero-support>
              <button type="button" className={styles.primaryAction} onClick={openAccess}>Start free <span>→</span></button>
              <button type="button" className={styles.secondaryAction} onClick={() => scrollTo("#workflow")}><i /> View workflow</button>
            </div>
            <div className={styles.trustRow} data-hero-support>
              <span><i /> No automatic misconduct verdict</span>
              <span><i /> Original upload not retained</span>
              <span><i /> Local Ollama-ready AI path</span>
            </div>
          </div>

          <div className={styles.productVisual} data-product-frame>
            <canvas ref={canvasRef} className={styles.scene} aria-hidden="true" />
            <div className={styles.productHalo} aria-hidden="true" />
            <div className={styles.productFrame}>
              <div className={styles.browserBar}>
                <span className={styles.browserDots}><i /><i /><i /></span>
                <span className={styles.browserUrl}>averis · evidence workspace</span>
                <span className={styles.privateChip}>PRIVATE REVIEW</span>
              </div>

              <div className={styles.appShell}>
                <aside className={styles.previewSidebar} aria-hidden="true">
                  <span className={styles.previewSymbol} />
                  <i className={styles.sideActive}>R</i>
                  <i>D</i><i>E</i><i>S</i><i>C</i><i>↗</i>
                </aside>

                <div className={styles.previewMain}>
                  <div className={styles.previewHeader}>
                    <div>
                      <span>REVISION REVIEW</span>
                      <strong>Research Paper · Final Draft</strong>
                      <small>8,429 words · evidence preview</small>
                    </div>
                    <button type="button" tabIndex={-1}>Export report</button>
                  </div>

                  <div className={styles.previewTabs}>
                    <span className={styles.tabActive}>Overview</span><span>Evidence</span><span>Sources</span><span>Citations</span><span>Revision</span>
                  </div>

                  <div className={styles.metricGrid}>
                    <article>
                      <span>Source overlap</span>
                      <strong>18%</strong>
                      <div className={styles.segmentBar}><i /><i /><i /><i /><i /></div>
                      <small>review signal · not a verdict</small>
                    </article>
                    <article>
                      <span>Citation context</span>
                      <strong>84%</strong>
                      <div className={styles.progressBar}><i style={{ width: "84%" }} /></div>
                      <small>recognized markers near matches</small>
                    </article>
                    <article>
                      <span>References linked</span>
                      <strong>12</strong>
                      <div className={styles.referenceDots}><i /><i /><i /><i /><i /><i /></div>
                      <small>DOI / bibliography evidence</small>
                    </article>
                    <article>
                      <span>Review priority</span>
                      <strong>03</strong>
                      <div className={styles.priorityStack}><b>High</b><b>Review</b><b>Context</b></div>
                      <small>human attention order</small>
                    </article>
                  </div>

                  <div className={styles.evidencePanel}>
                    <div className={styles.evidenceHeading}>
                      <div><span>PASSAGE EVIDENCE</span><strong>What deserves attention first</strong></div>
                      <span>3 of 8 shown</span>
                    </div>
                    <div className={styles.evidenceRow}>
                      <span className={styles.rowIndex}>01</span>
                      <div><strong>High-overlap wording needs context</strong><small>Source match · quotation not detected · citation nearby</small></div>
                      <b className={styles.highBadge}>HIGH ATTENTION</b>
                    </div>
                    <div className={styles.evidenceRow}>
                      <span className={styles.rowIndex}>02</span>
                      <div><strong>Citation marker linked to bibliography</strong><small>Crossref metadata resolved · verify source support</small></div>
                      <b className={styles.reviewBadge}>REVIEW</b>
                    </div>
                    <div className={styles.evidenceRow}>
                      <span className={styles.rowIndex}>03</span>
                      <div><strong>Quoted passage with attribution</strong><small>Quotation detected · citation detected · reference linked</small></div>
                      <b className={styles.contextBadge}>CONTEXTUALIZED</b>
                    </div>
                  </div>
                </div>
              </div>
              <span className={styles.scanLine} data-scan-line aria-hidden="true" />
            </div>
          </div>
        </div>

        <div id="platform" className={styles.capabilityStrip} data-reveal>
          <div><span>01</span><strong>Evidence-first</strong><small>Passage-level context</small></div>
          <div><span>02</span><strong>Crossref-linked</strong><small>Reference metadata checks</small></div>
          <div><span>03</span><strong>Private by design</strong><small>Bounded data handling</small></div>
          <div><span>04</span><strong>Local AI ready</strong><small>Optional Ollama runtime</small></div>
        </div>

        <section id="workflow" className={styles.workflowSection}>
          <div className={styles.sectionLead} data-reveal>
            <div>
              <p>THE AVERIS PLATFORM</p>
              <h2>A complete academic-integrity workflow.</h2>
            </div>
            <p>Move from source overlap to attribution and revision without losing the evidence that explains why a passage needs attention.</p>
          </div>

          <div className={styles.workflowGrid}>
            {workflow.map((item) => (
              <article key={item.index} data-reveal>
                <div className={styles.featureIcon}><FeatureIcon name={item.icon} /></div>
                <span>{item.index}</span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <i className={styles.cardArrow}>↗</i>
              </article>
            ))}
          </div>
        </section>

        <section id="revision-safety" className={styles.revisionSection}>
          <div className={styles.revisionVisual} data-reveal>
            <div className={styles.diffWindow}>
              <div className={styles.diffTop}><span>WRITING REFINEMENT</span><b>Evidence checked first</b></div>
              <div className={styles.diffBody}>
                <div><span>ORIGINAL</span><p>The findings clearly show that the issue is very important and it is something that should be considered carefully.</p></div>
                <div><span>REFINED</span><p>The findings indicate that the issue warrants careful consideration because it directly affects the study&apos;s central claim.</p></div>
              </div>
              <div className={styles.preservationRow}><span>✓ Meaning preserved</span><span>✓ Citations retained</span><span>✓ Re-check required</span></div>
            </div>
          </div>
          <div className={styles.revisionCopy} data-reveal>
            <p>GUIDED REVISION · NOT DETECTOR EVASION</p>
            <h2>Improve the writing. Keep the evidence.</h2>
            <span>
              Averis can support clearer academic tone, structure, source-grounded paraphrasing and citation preservation. It does not optimize writing to hide AI use or beat detection systems.
            </span>
            <ul>
              <li>Show the evidence before suggesting a change.</li>
              <li>Keep quotations, citations and source meaning visible.</li>
              <li>Compare original and suggested text before accepting.</li>
              <li>Re-run evidence after revision.</li>
            </ul>
            <button type="button" onClick={openAccess}>Open the revision workspace <span>→</span></button>
          </div>
        </section>

        <section id="trust-boundary" className={styles.boundary} data-reveal>
          <div>
            <span>TRUST BOUNDARY</span>
            <h2>Evidence informs people. People make the decision.</h2>
            <p>Averis is designed to surface reviewable signals, provenance and context — not unsupported accusations or hidden academic-integrity verdicts.</p>
          </div>
          <div className={styles.boundaryActions}>
            <button type="button" className={styles.boundaryPrimary} onClick={openAccess}>Start with the free beta</button>
            <button type="button" className={styles.boundarySecondary} onClick={() => scrollTo("#averis-intro")}>Back to top ↑</button>
          </div>
        </section>
      </div>
    </section>
  );
}
