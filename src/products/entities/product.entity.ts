// products/product.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    Index,
} from 'typeorm';


@Entity('products')
export class Product {
    @PrimaryGeneratedColumn("increment")
    id: number;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ nullable: true })
    externalRef: string;

    // Jira Reference Fields
    @Column({ nullable: true })
    @Index()
    jiraIssueKey: string;

    @Column({ nullable: true })
    jiraIssueId: string;

    @Column({ nullable: true })
    ticketStatus: string;

    @Column({ nullable: true, default: 'PENDING' })
    jiraSyncStatus: 'OK' | 'FAILED' | 'PENDING';

    @Column({ nullable: true })
    jiraLastSyncAt: Date;

    // Metadata
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt: Date;
}
