"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

type RevealProps = {
  amount?: number;
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: "scale" | "up";
};

type StaggerProps = {
  amount?: number;
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 1 | -1;
  interval?: number;
};

type StaggerItemProps = {
  as?: "article" | "div";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

const visible = {
  opacity: 1,
  filter: "blur(0px)",
  transform: "translate3d(0, 0, 0) scale(1)",
};

export function Reveal({
  amount = 0.18,
  children,
  className,
  delay = 0,
  variant = "up",
}: RevealProps) {
  const reducedMotion = useReducedMotion();
  const hidden = {
    opacity: 0,
    filter: "blur(5px)",
    transform:
      variant === "scale"
        ? "translate3d(0, 18px, 0) scale(0.975)"
        : "translate3d(0, 24px, 0) scale(1)",
  };

  return (
    <motion.div
      className={className}
      initial={reducedMotion ? visible : hidden}
      whileInView={visible}
      viewport={{ once: true, amount, margin: "0px 0px -12%" }}
      transition={{
        duration: reducedMotion ? 0 : 0.8,
        delay: reducedMotion ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    filter: "blur(4px)",
    transform: "translate3d(0, 18px, 0)",
  },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    transform: "translate3d(0, 0, 0)",
    transition: { duration: 0.58, ease: [0.22, 1, 0.36, 1] },
  },
};

export function Stagger({
  amount = 0.35,
  children,
  className,
  delay = 0.12,
  direction = 1,
  interval = 0.12,
}: StaggerProps) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reducedMotion ? "visible" : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount, margin: "0px 0px -12%" }}
      variants={{
        hidden: {},
        visible: {
          transition: reducedMotion
            ? { duration: 0 }
            : {
                delayChildren: delay,
                staggerChildren: interval,
                staggerDirection: direction,
              },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  as = "div",
  children,
  className,
  style,
}: StaggerItemProps) {
  if (as === "article") {
    return (
      <motion.article
        className={className}
        style={style}
        variants={itemVariants}
      >
        {children}
      </motion.article>
    );
  }

  return (
    <motion.div className={className} style={style} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
